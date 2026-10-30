'use client';
// Salary Cap 5: pick any 5 under the cap, captain doubles, players lock at their first bounce.
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CAP_PICKS, lockedIds, priceOf, type CapEntry, type GameRow, type LGame, type LPlayer, type LRound } from '@/lib/aflw';
import { deleteGame, loadEntries, saveEntry } from '@/app/(app)/live/actions';
import { Empty, Face, LiveChip, MarginChart, Nums, NumsHead, PrizeStrip, Shell, projOf, gameLabel, isLive, useRound, type TeamRow } from './kit';

const HUE: Record<string, string> = { DEF: '#5aa9ff', MID: '#f5c242', RUC: '#b48cff', FWD: '#ff7a59' };
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);

/** Score with captain doubled; projection adds her average for the part of the game still to come. */
function capTotals(e: { players: number[]; captain: number | null } | undefined, byId: Map<number, LPlayer>, gameBySquad: Map<number, LGame>) {
  let score = 0, proj = 0, left = 0;
  for (const id of e?.players ?? []) {
    const p = byId.get(id); if (!p) continue;
    const m = id === e?.captain ? 2 : 1, g = gameBySquad.get(p.squadId);
    score += (p.score ?? 0) * m;
    if (g?.status === 'completed') proj += (p.score ?? 0) * m;
    else if (isLive(g)) { const done = Math.min(1, ((g!.period ?? 1) - 1 + Math.min(1, (g!.periodSeconds ?? 0) / 1080)) / 4); proj += ((p.score ?? 0) + (p.avg ?? 0) * (1 - done)) * m; left++; }
    else { proj += (p.avg ?? 0) * m; left++; }
  }
  return { score, proj: Math.round(proj), left };
}

export function CapGame({ initialRound, game, initialEntries, ready, teams, myTeamId, canManage }: {
  initialRound: LRound; game: GameRow; initialEntries: CapEntry[]; ready: boolean; teams: TeamRow[]; myTeamId: number; canManage: boolean;
}) {
  const router = useRouter();
  const { data, byId, gameBySquad, liveNow } = useRound(initialRound);
  const [entries, setEntries] = useState(initialEntries);
  const refresh = useCallback(async () => { const r = await loadEntries(game.id); if (r.ready) setEntries(r.entries); }, [game.id]);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 20_000); return () => clearInterval(id); }, [refresh]);
  const teamName = useCallback((id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`, [teams]);
  const budget = game.budget ?? 350;
  const match = game.match_id ? data.games.find((g) => g.id === game.match_id) : null;
  const scopeGames = match ? [match] : data.games;
  const anyStarted = scopeGames.some((g) => g.status !== 'scheduled');
  const inGame = game.order.includes(myTeamId);
  const mineSaved = entries.find((e) => e.team_id === myTeamId);
  const [tab, setTab] = useState<'pick' | 'live'>(inGame && !anyStarted ? 'pick' : 'live');
  const status = scopeGames.every((g) => g.status === 'completed') ? 'Final' : scopeGames.some(isLive) ? 'Live' : anyStarted ? 'In progress' : 'Picks open';
  return (
    <Shell compact title={game.name} sub={<>{data.name} · {match ? `${match.home} v ${match.away} only` : 'whole round'} · ${budget}k cap</>}
      right={<div className="rh-headright">
        <div className="rh-seg" role="tablist">
          {inGame && <button role="tab" aria-selected={tab === 'pick'} className={tab === 'pick' ? 'on' : ''} onClick={() => setTab('pick')}>My 5</button>}
          <button role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>Matchup</button>
        </div>
        <LiveChip live={status === 'Live' || status === 'Picks open'} text={status} />
      </div>}>
      <PrizeStrip prize={game.prize} clubs={game.order.length} final={scopeGames.every((g) => g.status === 'completed')} teamName={teamName} myTeamId={myTeamId}
        standings={[...game.order].sort((x, y) => capTotals(entries.find((e) => e.team_id === y), byId, gameBySquad).score - capTotals(entries.find((e) => e.team_id === x), byId, gameBySquad).score)} />
      {!ready && <Empty>Run supabase/migrations/0011_salary_cap.sql in the Supabase SQL editor to switch salary-cap games on.</Empty>}
      {tab === 'pick' && inGame
        ? <Picker game={game} round={data} byId={byId} saved={mineSaved} budget={budget} onSaved={refresh} />
        : <CapBoard game={game} entries={entries} byId={byId} gameBySquad={gameBySquad} teamName={teamName} myTeamId={myTeamId} liveNow={liveNow} />}
      {canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="rh-btn danger" onClick={async () => { if (window.confirm('Delete this game and every entry?')) { const r = await deleteGame(game.id); if (r.ok) router.push('/live/games'); } }}>Delete game</button>
        </div>
      )}
    </Shell>
  );
}

/* ---------------- picking ---------------- */

function Picker({ game, round, byId, saved, budget, onSaved }: { game: GameRow; round: LRound; byId: Map<number, LPlayer>; saved?: CapEntry; budget: number; onSaved: () => Promise<void> }) {
  const [sel, setSel] = useState<number[]>(saved?.players ?? []);
  const [cap, setCap] = useState<number | null>(saved?.captain ?? null);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('ALL');
  const [sort, setSort] = useState<'avg' | 'price' | 'value'>('avg');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = useMemo(() => lockedIds(round), [round]);
  const scope = game.match_id ? round.games.find((g) => g.id === game.match_id) : null;
  const inScope = (p: LPlayer) => !scope || p.squadId === scope.homeId || p.squadId === scope.awayId;
  const spent = sel.reduce((s, id) => s + (byId.get(id) ? priceOf(byId.get(id)!) : 0), 0);
  const left = budget - spent;
  const dirty = JSON.stringify([...sel].sort()) !== JSON.stringify([...(saved?.players ?? [])].sort()) || cap !== (saved?.captain ?? null);
  const perSlot = sel.length < CAP_PICKS ? Math.floor(left / (CAP_PICKS - sel.length)) : 0;
  const pool = round.players.filter((p) => inScope(p) && p.status !== 'injured')
    .filter((p) => pos === 'ALL' || p.pos.includes(pos))
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.squad.toLowerCase() === q.toLowerCase())
    .sort((a, b) => sort === 'price' ? priceOf(b) - priceOf(a) : sort === 'value' ? (b.avg ?? 0) / priceOf(b) - (a.avg ?? 0) / priceOf(a) || (b.avg ?? 0) - (a.avg ?? 0) : (b.avg ?? 0) - (a.avg ?? 0));
  const add = (id: number) => { setMsg(null); setSel((s) => s.length >= CAP_PICKS ? s : [...s, id]); };
  const remove = (id: number) => { setSel((s) => s.filter((x) => x !== id)); if (cap === id) setCap(null); };
  const save = () => start(async () => {
    const r = await saveEntry(game.id, sel, cap);
    setMsg(r.ok ? { ok: true, text: 'Saved. You can change unlocked players until their game starts.' } : { ok: false, text: r.error ?? 'Couldn’t save.' });
    if (r.ok) await onSaved();
  });
  return (
    <div className="cap">
      <section className="rh-card cap-five">
        <div className="cap-budget">
          <div>
            <span className="rh-k">Remaining</span>
            <b className={`cap-left ${left < 0 ? 'rh-down' : ''}`}>{left < 0 ? `-$${-left}k` : `$${left}k`}</b>
          </div>
          <div className="cap-bar"><span style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} className={left < 0 ? 'over' : ''} /></div>
          <span className="rh-dim" style={{ fontSize: 12 }}>${spent}k of ${budget}k{sel.length < CAP_PICKS && left >= 0 ? ` · ~$${perSlot}k a spot for ${CAP_PICKS - sel.length} more` : ''}</span>
        </div>
        <div className="cap-slots">
          {Array.from({ length: CAP_PICKS }, (_, i) => {
            const p = byId.get(sel[i] ?? -1);
            if (!p) return <div key={i} className="cap-slot empty">Pick {i + 1}</div>;
            const lk = locked.has(p.id);
            return (
              <div key={p.id} className={`cap-slot ${cap === p.id ? 'capt' : ''}`}>
                <button className={`cap-c ${cap === p.id ? 'on' : ''}`} disabled={lk} onClick={() => setCap(cap === p.id ? null : p.id)} title="Captain scores double">C</button>
                <span className="cap-slot-n" data-pid={p.id}><Face p={p} size={22} />{p.name}</span>
                <span className="rh-dim cap-slot-m">{p.squad} · {p.pos.join('/')} · ${priceOf(p)}k{lk ? ' · 🔒' : ''}</span>
                {!lk && <button className="cap-x" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>×</button>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="rh-btn go" disabled={pending || !dirty || left < 0} onClick={save}>{dirty ? 'Save my 5' : 'Saved'}</button>
          {!cap && sel.length > 0 && <span className="rh-dim" style={{ fontSize: 12 }}>Tap C to pick a captain (scores double).</span>}
          {msg && <span className={msg.ok ? 'rh-up' : 'rh-down'} style={{ fontSize: 12.5 }}>{msg.text}</span>}
        </div>
      </section>

      <section className="rh-card rh-pool">
        <div className="rh-pool-ctl">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players or clubs" className="rh-input" aria-label="Search players" />
          <div className="rh-seg">{['ALL', 'DEF', 'MID', 'RUC', 'FWD'].map((s) => <button key={s} className={pos === s ? 'on' : ''} onClick={() => setPos(s)}>{s === 'ALL' ? 'All' : s}</button>)}</div>
          <div className="rh-seg">{([['avg', 'Avg'], ['price', 'Price'], ['value', 'Value']] as const).map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div>
        </div>
        <div className="rh-list">
          <div className="rh-lrow head cap-row"><span>Player</span><span>Avg</span><span className="hide-sm">L3</span><span>Price</span><span /></div>
          {pool.slice(0, 120).map((p) => {
            const on = sel.includes(p.id), lk = locked.has(p.id), price = priceOf(p);
            const afford = price <= left, full = sel.length >= CAP_PICKS;
            return (
              <div key={p.id} className={`rh-lrow cap-row ${on ? 'picked' : ''}`}>
                <span className="rh-who" data-pid={p.id}><Face p={p} size={34} /><span className="rh-pl"><span className="rh-pl-n">{p.name}</span><span className="rh-pl-m">{p.squad} · {p.pos.map((x) => <b key={x} style={{ color: HUE[x] }}>{x} </b>)}{p.status === 'uncertain' && <em className="rh-doubt">doubt</em>}</span></span></span>
                <span className="rh-num">{p.avg?.toFixed(0) ?? '–'}</span>
                <span className="rh-num rh-dim hide-sm">{p.l3?.toFixed(0) ?? '–'}</span>
                <span className="rh-num">${price}k</span>
                {lk ? <span className="rh-dim" style={{ fontSize: 12, textAlign: 'center' }}>🔒 {gameLabel(round.games.find((g) => g.homeId === p.squadId || g.awayId === p.squadId))}</span>
                  : on ? <button className="rh-btn alt" onClick={() => remove(p.id)}>Remove</button>
                  : <button className={`rh-btn ${!full && afford ? 'soft' : 'off'}`} disabled={full || !afford} onClick={() => add(p.id)}>{full ? 'Full' : afford ? 'Add' : `$${price - left}k over`}</button>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ---------------- leaderboard + head to head ---------------- */

function CapBoard({ game, entries, byId, gameBySquad, teamName, myTeamId, liveNow }: {
  game: GameRow; entries: CapEntry[]; byId: Map<number, LPlayer>; gameBySquad: Map<number, LGame>; teamName: (id: number) => string; myTeamId: number; liveNow: boolean;
}) {
  const rows = game.order.map((t) => { const e = entries.find((x) => x.team_id === t); return { t, e, ...capTotals(e, byId, gameBySquad) }; })
    .sort((a, b) => b.score - a.score || b.proj - a.proj);
  const me = game.order.includes(myTeamId) ? myTeamId : rows[0]?.t;
  const [opp, setOpp] = useState<number>(rows.find((r) => r.t !== me)?.t ?? game.order[0]);
  const top = rows[0]?.score ?? 0;
  const A = rows.find((r) => r.t === me), B = rows.find((r) => r.t === opp);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <section className="rh-card" style={{ padding: 0, gap: 0 }}>
        {rows.map((r, i) => (
          <button key={r.t} className={`rh-lb ${r.t === myTeamId ? 'me' : ''} ${r.t === opp ? 'sel' : ''}`} onClick={() => r.t !== me && setOpp(r.t)}>
            <span className="rh-lb-rank">{i + 1}</span>
            <span className="rh-lb-name">{teamName(r.t)}{r.t === myTeamId && <em>you</em>}</span>
            <span className="rh-dim" style={{ fontSize: 12 }}>{!r.e ? 'no entry' : r.e.hidden ? `${r.e.hidden} hidden` : `proj ${r.proj}`}</span>
            <span className="rh-lb-score">{r.score}</span>
            <span className={`rh-lb-gap ${i === 0 ? 'up' : 'down'}`}>{i === 0 ? (rows[1] ? signed(r.score - rows[1].score) : '') : signed(r.score - top)}</span>
          </button>
        ))}
      </section>
      {A && B && me !== opp && (
        <section className="rh-card rh-h2h">
          <div className="rh-h2h-top">
            <div className="rh-side"><span className="rh-side-n">{teamName(me)}{me === myTeamId && <em>you</em>}</span><b className={`rh-big ${A.score >= B.score ? 'up' : ''}`}>{A.score}</b></div>
            <div className="rh-mid">
              <span className={`rh-delta ${A.score - B.score >= 0 ? 'up' : 'down'}`}>{signed(A.score - B.score)}</span>
              <span className="rh-dim">{A.left + B.left ? `${A.left} v ${B.left} to play` : 'final'}</span>
            </div>
            <div className="rh-side r"><span className="rh-side-n">{teamName(opp)}</span><b className={`rh-big ${A.score < B.score ? 'down' : 'dim'}`}>{B.score}</b></div>
          </div>
          <MarginChart id={`cap-${game.id}-${me}-${opp}`} margin={A.score - B.score} live={liveNow} />
          <div className="rh-rows">
            <NumsHead />
            {Array.from({ length: CAP_PICKS }, (_, i) => {
              const pa = byId.get(A.e?.players[i] ?? -1), pb = byId.get(B.e?.players[i] ?? -1);
              const cell = (p: LPlayer | undefined, e: CapEntry | undefined, right: boolean, hiddenIdx: boolean) => {
                const g = p ? gameBySquad.get(p.squadId) : undefined, c = !!p && e?.captain === p.id;
                const sc = p?.score != null ? p.score * (c ? 2 : 1) : null;
                const name = <span className={`rh-who ${right ? 'r' : ''}`} data-pid={p?.id}>{p && <Face p={p} size={28} />}<span className={`rh-pl ${right ? 'r' : ''}`}><span className="rh-pl-n">{p ? <>{c && <b className="cap-cb">C</b>}{p.name}</> : hiddenIdx ? <span className="rh-dim">Hidden till bounce</span> : '—'}</span>{p && <span className="rh-pl-m">{p.squad} · <span className={isLive(g) ? 'rh-on' : ''}>{gameLabel(g)}</span></span>}</span></span>;
                const num = <Nums proj={projOf(p, g, c ? 2 : 1)} score={sc} right={right} />;
                return right ? <>{num}{name}</> : <>{name}{num}</>;
              };
              return (
                <div key={i} className="rh-row">
                  {cell(pa, A.e, false, false)}
                  <span className="rh-slot" style={{ color: 'var(--rh-dim)' }}>{i + 1}</span>
                  {cell(pb, B.e, true, !!B.e && i >= (B.e.players.length) && i < B.e.players.length + B.e.hidden)}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
