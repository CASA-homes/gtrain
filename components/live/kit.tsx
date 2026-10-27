'use client';
// Live Matchups UI kit: dark, minimal, one green for winning and one orange for losing.
import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PICKS_PER_TEAM, SLOTS, lineupsFromPicks, onClock, slotFor, type GamePick, type GameRow, type LGame, type LPlayer, type LRound, type Lineup, type Slot } from '@/lib/aflw';
import { deleteGame, loadGame, makePick, undoPick } from '@/app/(app)/live/actions';

export type TeamRow = { id: number; name: string; short_code: string };
export const SLOT_ORDER = Object.keys(SLOTS) as Slot[];
const SLOT_NAME: Record<Slot, string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forwards' };
const PERTH = 'Australia/Perth';
const cssVar = (name: string, value: string) => ({ [name]: value }) as React.CSSProperties;
const SLOT_HUE: Record<Slot, string> = { DEF: '#5aa9ff', MID: '#f5c242', RUC: '#b48cff', FWD: '#ff7a59' };

export const isLive = (g?: LGame) => !!g && g.status !== 'scheduled' && g.status !== 'completed';
export function gameLabel(g?: LGame) {
  if (!g) return 'No game';
  if (g.status === 'completed') return 'Final';
  if (g.status === 'scheduled') return new Date(g.date).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: PERTH });
  const m = Math.floor((g.periodSeconds ?? 0) / 60), s = (g.periodSeconds ?? 0) % 60;
  return `Q${g.period ?? '?'} · ${m}:${String(s).padStart(2, '0')}`;
}
const surname = (n: string) => n.split(' ').slice(1).join(' ') || n;
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);

/* ---------------- data hooks ---------------- */

/** Live round data, refreshed every 25s while games are on or still to come. */
export function useRound(initial: LRound) {
  const [data, setData] = useState(initial);
  const [at, setAt] = useState(() => new Date(initial.fetchedAt));
  useEffect(() => {
    if (data.status === 'completed') return;
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try { const r = await fetch(`/api/live?round=${data.round}`, { cache: 'no-store' }); if (r.ok && !stop) { setData(await r.json()); setAt(new Date()); } } catch { /* next tick */ }
    };
    const id = setInterval(tick, 25_000);
    document.addEventListener('visibilitychange', tick);
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [data.round, data.status]);
  const byId = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const gameBySquad = useMemo(() => { const m = new Map<number, LGame>(); for (const g of data.games) { m.set(g.homeId, g); m.set(g.awayId, g); } return m; }, [data.games]);
  return { data, at, byId, gameBySquad, liveNow: data.games.some(isLive) };
}

/** A game's picks, refreshed every 3s while it's drafting. */
export function useGame(initial: { game: GameRow; picks: GamePick[] }) {
  const [game, setGame] = useState(initial.game);
  const [picks, setPicks] = useState(initial.picks);
  const refresh = useCallback(async () => { const r = await loadGame(initial.game.id); if (r.game) { setGame(r.game); setPicks(r.picks); } }, [initial.game.id]);
  useEffect(() => {
    if (game.status !== 'drafting') return;
    const id = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 3000);
    return () => clearInterval(id);
  }, [game.status, refresh]);
  return { game, picks, refresh };
}

export function totals(l: Lineup | undefined, byId: Map<number, LPlayer>, gameBySquad: Map<number, LGame>) {
  let score = 0, proj = 0, left = 0;
  for (const s of SLOT_ORDER) for (const id of l?.[s] ?? []) {
    const p = byId.get(id); if (!p) continue;
    const g = gameBySquad.get(p.squadId);
    score += p.score ?? 0;
    if (g?.status === 'completed') proj += p.score ?? 0;
    else if (isLive(g)) {
      // score so far plus her average for the share of the game still to come (AFLW quarters run about 18 minutes)
      const done = Math.min(1, ((g!.period ?? 1) - 1 + Math.min(1, (g!.periodSeconds ?? 0) / 1080)) / 4);
      proj += (p.score ?? 0) + (p.avg ?? 0) * (1 - done); left++;
    } else { proj += p.avg ?? 0; left++; }
  }
  return { score, proj: Math.round(proj), left };
}

/* ---------------- shell ---------------- */

const SECTIONS = [
  { href: '/live', label: 'Home' },
  { href: '/live/games', label: 'Current games' },
  { href: '/live/new', label: 'New game' },
  { href: '/live/matchups', label: 'Matchups' },
  { href: '/live/scores', label: 'Live scores' },
];
export function Shell({ title, sub, right, children }: { title: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="rh">
      <nav className="rh-sub" aria-label="Live Matchups">
        {SECTIONS.map((s) => <Link key={s.href} href={s.href} aria-current={(s.href === '/live' ? path === '/live' : path.startsWith(s.href)) ? 'page' : undefined}>{s.label}</Link>)}
      </nav>
      <header className="rh-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="rh-title">{title}</h1>
          {sub && <div className="rh-dim" style={{ marginTop: 4 }}>{sub}</div>}
        </div>
        {right}
      </header>
      {children}
    </div>
  );
}
export function LiveChip({ live, text }: { live: boolean; text: string }) {
  return <span className={`rh-chip ${live ? 'live' : ''}`}>{live && <i className="rh-pulse" />}{text}</span>;
}
export function Empty({ children }: { children: React.ReactNode }) { return <div className="rh-card rh-empty">{children}</div>; }

/* ---------------- margin chart ---------------- */

/** Your margin through the round, sampled each refresh while the page is open (kept on this device). */
export function MarginChart({ id, margin, live }: { id: string; margin: number; live: boolean }) {
  const key = `gt-margin-${id}`;
  const [pts, setPts] = useState<{ t: number; m: number }[]>([]);
  useEffect(() => {
    let arr: { t: number; m: number }[] = [];
    try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch { arr = []; }
    if (live || !arr.length) {
      if (!arr.length || arr[arr.length - 1].m !== margin) arr.push({ t: Date.now(), m: margin });
      arr = arr.slice(-400);
      try { localStorage.setItem(key, JSON.stringify(arr)); } catch { /* private mode */ }
    }
    setPts(arr);
  }, [key, margin, live]);
  const W = 600, H = 120;
  const series = pts.length > 1 ? pts : [{ t: 0, m: 0 }, { t: 1, m: margin }];
  const lo = Math.min(0, ...series.map((p) => p.m)), hi = Math.max(0, ...series.map((p) => p.m));
  const span = Math.max(20, hi - lo);
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (m: number) => H - 8 - ((m - lo) / span) * (H - 16);
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.m).toFixed(1)}`).join(' ');
  const up = margin >= 0;
  return (
    <svg className="rh-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Margin ${signed(margin)}`}>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="rh-chart-zero" />
      <path d={`${d} L${W},${H} L0,${H} Z`} className={`rh-chart-fill ${up ? 'up' : 'down'}`} />
      <path d={d} className={`rh-chart-line ${up ? 'up' : 'down'}`} vectorEffect="non-scaling-stroke" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].m)} r="4" className={`rh-chart-dot ${up ? 'up' : 'down'}`} />
    </svg>
  );
}

/* ---------------- head to head ---------------- */

export function HeadToHead({ gameId, me, opp, lineups, byId, gameBySquad, teamName, myTeamId, liveNow }: {
  gameId: number; me: number; opp: number; lineups: Record<number, Lineup>; byId: Map<number, LPlayer>; gameBySquad: Map<number, LGame>;
  teamName: (id: number) => string; myTeamId: number; liveNow: boolean;
}) {
  const a = totals(lineups[me], byId, gameBySquad), b = totals(lineups[opp], byId, gameBySquad);
  const done = a.left === 0 && b.left === 0 && a.score + b.score > 0;
  const margin = a.score - b.score, pm = a.proj - b.proj;
  const up = (a.score + b.score > 0 ? margin : pm) >= 0;
  const share = a.proj + b.proj > 0 ? a.proj / (a.proj + b.proj) : 0.5;
  return (
    <section className="rh-card rh-h2h">
      <div className="rh-h2h-top">
        <div style={{ minWidth: 0 }}>
          <span className="rh-dim">{teamName(me)}{me === myTeamId ? ' · you' : ''}</span>
          <div className="rh-big">{a.score}<span className="rh-vs">vs {b.score}</span></div>
          <div className={`rh-delta ${up ? 'up' : 'down'}`}>
            {a.score + b.score === 0 ? <>Projected {signed(pm)}</> : <>{signed(margin)} {done ? 'final' : 'now'} · {signed(pm)} projected</>}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <span className="rh-dim">{teamName(opp)}</span>
          <div className="rh-dim" style={{ fontSize: 12, marginTop: 6 }}>{a.left + b.left > 0 ? `${a.left} v ${b.left} still to play` : 'All games done'}</div>
          <div className="rh-winbar" title="Share of projected points"><span style={{ width: `${share * 100}%` }} className={up ? 'up' : 'down'} /></div>
          <div className="rh-dim" style={{ fontSize: 11 }}>{Math.round(share * 100)}% of projected points</div>
        </div>
      </div>
      <MarginChart id={`${gameId}-${me}-${opp}`} margin={a.score + b.score === 0 ? pm : margin} live={liveNow} />
      <div className="rh-rows">
        {SLOT_ORDER.map((s) => (
          <Fragment key={s}>
            <div className="rh-line" style={cssVar('--c', SLOT_HUE[s])}>{SLOT_NAME[s]}</div>
            {Array.from({ length: SLOTS[s] }, (_, i) => {
              const pa = byId.get(lineups[me]?.[s]?.[i] ?? -1), pb = byId.get(lineups[opp]?.[s]?.[i] ?? -1);
              const sa = pa?.score ?? null, sb = pb?.score ?? null;
              const cell = (p: LPlayer | undefined, sc: number | null, other: number | null, right: boolean) => {
                const g = p ? gameBySquad.get(p.squadId) : undefined;
                const name = (
                  <span className={`rh-pl ${right ? 'r' : ''}`}>
                    <span className="rh-pl-n">{p?.name ?? '—'}</span>
                    {p && <span className="rh-pl-m">{p.squad} · <span className={isLive(g) ? 'rh-on' : ''}>{gameLabel(g)}</span></span>}
                  </span>
                );
                const num = <span className={`rh-pts ${sc == null ? 'pre' : other != null && sc > other ? 'up' : other != null && sc < other ? 'dn' : ''}`}>{sc ?? (p?.avg != null ? `~${Math.round(p.avg)}` : '')}</span>;
                return right ? <>{num}{name}</> : <>{name}{num}</>;
              };
              return (
                <div key={s + i} className="rh-row">
                  {cell(pa, sa, sb, false)}
                  <span className="rh-slot" style={cssVar('--c', SLOT_HUE[s])}>{s}</span>
                  {cell(pb, sb, sa, true)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

/** Ranked table for games with 3+ clubs. */
export function Leaderboard({ order, lineups, byId, gameBySquad, teamName, myTeamId, onPick, selected }: {
  order: number[]; lineups: Record<number, Lineup>; byId: Map<number, LPlayer>; gameBySquad: Map<number, LGame>; teamName: (id: number) => string;
  myTeamId: number; onPick?: (id: number) => void; selected?: number;
}) {
  const rows = order.map((t) => ({ t, ...totals(lineups[t], byId, gameBySquad) })).sort((x, y) => y.score - x.score || y.proj - x.proj);
  const top = rows[0]?.score ?? 0;
  return (
    <section className="rh-card" style={{ padding: 0 }}>
      {rows.map((r, i) => (
        <button key={r.t} className={`rh-lb ${r.t === myTeamId ? 'me' : ''} ${selected === r.t ? 'sel' : ''}`} onClick={() => onPick?.(r.t)}>
          <span className="rh-lb-rank">{i + 1}</span>
          <span className="rh-lb-name">{teamName(r.t)}{r.t === myTeamId && <em>you</em>}</span>
          <span className="rh-dim" style={{ fontSize: 12 }}>proj {r.proj}</span>
          <span className="rh-lb-score">{r.score}</span>
          <span className={`rh-lb-gap ${i === 0 ? 'up' : 'down'}`}>{i === 0 ? (rows[1] ? signed(r.score - rows[1].score) : '') : signed(r.score - top)}</span>
        </button>
      ))}
    </section>
  );
}

/* ---------------- draft room ---------------- */

function useClock(since: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function DraftRoom({ game, picks, refresh, players, teamName, myTeamId, canManage }: {
  game: GameRow; picks: GamePick[]; refresh: () => Promise<void>; players: LPlayer[]; teamName: (id: number) => string; myTeamId: number; canManage: boolean;
}) {
  const router = useRouter();
  const n = game.order.length, total = n * PICKS_PER_TEAM, k = picks.length;
  const done = game.status === 'done' || k >= total;
  const clockTeam = done ? null : onClock(game.order, k);
  const mine = clockTeam === myTeamId;
  const canPick = !done && (mine || canManage);
  const inGame = game.order.includes(myTeamId);
  const [view, setView] = useState(inGame ? myTeamId : game.order[0]);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<Slot | 'ALL'>('ALL');
  const [onlyFit, setOnlyFit] = useState(true);
  const [limit, setLimit] = useState(40);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const last = picks[picks.length - 1];
  const clock = useClock(last?.picked_at ?? game.created_at);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const taken = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const picksOf = (t: number) => picks.filter((p) => p.team_id === t);
  const fits = (p: LPlayer, t: number | null) => t != null && slotFor(p.pos, picksOf(t)) != null;
  const pool = players
    .filter((p) => !taken.has(p.id) && p.status !== 'injured')
    .filter((p) => pos === 'ALL' || p.pos.includes(pos))
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.squad.toLowerCase() === q.toLowerCase())
    .filter((p) => !onlyFit || !clockTeam || fits(p, clockTeam))
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const pick = (p: LPlayer) => start(async () => {
    setMsg(null);
    const who = clockTeam;
    const r = await makePick(game.id, p.id);
    setMsg(r.ok ? { ok: true, text: `${p.name} → ${who === myTeamId ? 'your team' : teamName(who!)}` } : { ok: false, text: r.error ?? 'Couldn’t make that pick.' });
    await refresh();
  });
  const auto = () => { const best = players.filter((p) => !taken.has(p.id) && p.status !== 'injured' && fits(p, clockTeam)).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0]; if (best) pick(best); };
  const upNext = Array.from({ length: Math.max(0, Math.min(6, total - k - 1)) }, (_, i) => ({ k: k + 1 + i, t: onClock(game.order, k + 1 + i) }));
  let nextMine: number | null = null;
  for (let j = k; j < total; j++) if (onClock(game.order, j) === myTeamId) { nextMine = j; break; }
  const viewPicks = picksOf(view);

  return (
    <div className="rh-draft">
      <div className={`rh-clock ${mine ? 'mine' : ''} ${done ? 'done' : ''}`} aria-live="polite">
        <div style={{ minWidth: 0 }}>
          <span className="rh-clock-k">{done ? 'Draft complete' : mine ? 'You’re on the clock' : 'On the clock'}</span>
          <div className="rh-clock-team">{done ? `${total} picks in` : teamName(clockTeam!)}</div>
          <span className="rh-dim">
            {done ? 'Teams are locked. Scores go live with the first bounce.' : <>Pick {k + 1} of {total} · round {Math.floor(k / n) + 1} · <span className="rh-mono">{clock}</span>{!mine && nextMine != null && <> · you’re up {nextMine - k === 1 ? 'next' : `in ${nextMine - k}`}</>}</>}
          </span>
        </div>
        {last && (
          <div className="rh-clock-last">
            <span className="rh-dim" style={{ fontSize: 11 }}>Last pick · #{last.pick_no + 1}</span>
            <b>{last.player_name}</b>
            <span className="rh-dim" style={{ fontSize: 12 }}>{last.slot} · {teamName(last.team_id)}</span>
          </div>
        )}
      </div>

      <div className="rh-dgrid">
        <aside className="rh-dleft">
          <div className="rh-card" style={{ gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="rh-k">{view === myTeamId ? 'Your team' : 'Team'}</span>
              <select value={view} onChange={(e) => setView(Number(e.target.value))} className="rh-select sm">
                {game.order.map((t) => <option key={t} value={t}>{teamName(t)}{t === myTeamId ? ' (you)' : ''}</option>)}
              </select>
            </div>
            <Oval picks={viewPicks} byId={byId} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="rh-dim">
              <span>{viewPicks.length}/11</span>
              <span>Avg total <b style={{ color: 'var(--rh-text)' }}>{Math.round(viewPicks.reduce((s, p) => s + (byId.get(p.player_id)?.avg ?? 0), 0))}</b></span>
            </div>
          </div>
        </aside>

        <section className="rh-card rh-pool">
          <div className="rh-pool-ctl">
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} placeholder="Search players or clubs" className="rh-input" aria-label="Search players" />
            <div className="rh-seg">
              {(['ALL', ...SLOT_ORDER] as (Slot | 'ALL')[]).map((s) => <button key={s} className={pos === s ? 'on' : ''} onClick={() => { setPos(s); setLimit(40); }}>{s === 'ALL' ? 'All' : s}</button>)}
            </div>
            {!done && <label className="rh-toggle"><input type="checkbox" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} /><span />Only open spots</label>}
          </div>
          {msg && <div className={`rh-toast ${msg.ok ? 'up' : 'down'}`}>{msg.text}</div>}
          <div className="rh-list">
            <div className="rh-lrow head"><span>Player</span><span>Avg</span><span className="hide-sm">L3</span><span className="hide-sm">High</span><span /></div>
            {pool.slice(0, limit).map((p) => {
              const ok = canPick && fits(p, clockTeam);
              return (
                <div key={p.id} className="rh-lrow">
                  <span className="rh-pl">
                    <span className="rh-pl-n">{p.name}</span>
                    <span className="rh-pl-m">{p.squad} · {p.pos.map((x) => <b key={x} style={{ color: SLOT_HUE[x as Slot] }}>{x} </b>)}{p.status === 'uncertain' && <em className="rh-doubt">doubt</em>}</span>
                  </span>
                  <span className="rh-num">{p.avg?.toFixed(0) ?? '–'}</span>
                  <span className="rh-num hide-sm rh-dim">{p.l3?.toFixed(0) ?? '–'}</span>
                  <span className="rh-num hide-sm rh-dim">{p.hi ?? '–'}</span>
                  <button className={`rh-btn ${ok ? (mine ? 'soft' : 'alt') : 'off'}`} disabled={!ok || pending} onClick={() => pick(p)}>{ok ? (mine ? 'Draft' : 'Pick for them') : '—'}</button>
                </div>
              );
            })}
            {pool.length === 0 && <span className="rh-dim" style={{ padding: 18 }}>Nobody left who fits.</span>}
            {pool.length > limit && <button className="rh-btn alt" style={{ margin: 14, alignSelf: 'center' }} onClick={() => setLimit(limit + 60)}>Show {Math.min(60, pool.length - limit)} more</button>}
          </div>
        </section>

        <aside className="rh-dright">
          {!done && upNext.length > 0 && (
            <div className="rh-card">
              <span className="rh-k">Up next</span>
              {upNext.map((u) => <div key={u.k} className={`rh-next ${u.t === myTeamId ? 'me' : ''}`}><span className="rh-mono rh-dim">#{u.k + 1}</span><span>{teamName(u.t)}</span>{u.t === myTeamId && <em>you</em>}</div>)}
            </div>
          )}
          <div className="rh-card">
            <span className="rh-k">Order · snake</span>
            <div className="rh-order">{game.order.map((t, i) => <span key={t} className={`${t === clockTeam ? 'clock' : ''} ${t === myTeamId ? 'me' : ''}`}>{i + 1}. {teamName(t)}</span>)}</div>
          </div>
          <div className="rh-card">
            <span className="rh-k">Recent picks</span>
            {[...picks].reverse().slice(0, 10).map((p) => (
              <div key={p.pick_no} className="rh-feed"><span className="rh-mono rh-dim">#{p.pick_no + 1}</span><i style={{ background: SLOT_HUE[p.slot] }} /><b>{p.player_name}</b><span className="rh-dim">{teamName(p.team_id)}</span></div>
            ))}
            {picks.length === 0 && <span className="rh-dim">No picks yet.</span>}
          </div>
          {canManage && (
            <div className="rh-card">
              <span className="rh-k">Game controls</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {!done && <button className="rh-btn alt" disabled={pending} onClick={auto}>Auto-pick</button>}
                <button className="rh-btn alt" disabled={pending || !picks.length} onClick={() => start(async () => { const r = await undoPick(game.id); if (!r.ok) setMsg({ ok: false, text: r.error ?? 'Failed' }); await refresh(); })}>Undo last</button>
                <button className="rh-btn danger" disabled={pending} onClick={() => { if (window.confirm('Delete this game and all its picks?')) start(async () => { const r = await deleteGame(game.id); if (r.ok) router.push('/live/games'); else setMsg({ ok: false, text: r.error ?? 'Failed' }); }); }}>Delete game</button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Board order={game.order} picks={picks} k={done ? -1 : k} teamName={teamName} myTeamId={myTeamId} />

      {inGame && (
        <div className={`rh-strip ${mine ? 'mine' : ''}`} aria-label="Your team so far">
          <b>{mine ? 'Your pick' : 'Your team'}</b>
          {SLOT_ORDER.map((s) => { const c = picksOf(myTeamId).filter((p) => p.slot === s).length; return <span key={s} className={c >= SLOTS[s] ? 'full' : ''} style={cssVar('--c', SLOT_HUE[s])}>{s} {c}/{SLOTS[s]}</span>; })}
        </div>
      )}
    </div>
  );
}

/** Your team on an oval: forwards up top, defence at the bottom. */
export function Oval({ picks, byId }: { picks: GamePick[]; byId: Map<number, LPlayer> }) {
  return (
    <div className="rh-oval">
      <i className="rh-oval-c" aria-hidden="true" />
      {(['FWD', 'RUC', 'MID', 'DEF'] as Slot[]).map((s) => {
        const got = picks.filter((p) => p.slot === s);
        return (
          <div key={s} className="rh-oval-line" aria-label={SLOT_NAME[s]}>
            {Array.from({ length: SLOTS[s] }, (_, i) => {
              const p = got[i];
              return p
                ? <span key={i} className="rh-ps on" style={cssVar('--c', SLOT_HUE[s])}><b>{surname(p.player_name)}</b><em>{byId.get(p.player_id)?.avg?.toFixed(0) ?? ''}</em></span>
                : <span key={i} className="rh-ps" style={cssVar('--c', SLOT_HUE[s])}>{s}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function Board({ order, picks, k, teamName, myTeamId }: { order: number[]; picks: GamePick[]; k: number; teamName: (id: number) => string; myTeamId: number }) {
  const n = order.length;
  const at = new Map(picks.map((p) => [p.pick_no, p]));
  return (
    <section className="rh-card" style={{ gap: 10 }}>
      <span className="rh-k">Draft board</span>
      <div style={{ overflowX: 'auto' }}>
        <div className="rh-board" style={{ gridTemplateColumns: `30px repeat(${n}, minmax(100px, 1fr))` }}>
          <span />
          {order.map((t) => <span key={t} className={`rh-bh ${t === myTeamId ? 'me' : ''}`}>{teamName(t)}</span>)}
          {Array.from({ length: PICKS_PER_TEAM }, (_, r) => (
            <Fragment key={r}>
              <span className="rh-br">{r + 1}</span>
              {order.map((t, i) => {
                const no = r * n + (r % 2 === 0 ? i : n - 1 - i);
                const p = at.get(no);
                return (
                  <span key={t} className={`rh-bc ${no === k ? 'clock' : ''} ${p ? 'on' : ''}`} style={p ? cssVar('--c', SLOT_HUE[p.slot]) : undefined}>
                    {p ? <><b>{surname(p.player_name)}</b><em>{p.slot}</em></> : <em>{no + 1}</em>}
                  </span>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- game page (draft, then results) ---------------- */

export function GameRoom({ initialRound, initialGame, initialPicks, teams, myTeamId, canManage }: {
  initialRound: LRound; initialGame: GameRow; initialPicks: GamePick[]; teams: TeamRow[]; myTeamId: number; canManage: boolean;
}) {
  const { data, byId, gameBySquad, liveNow } = useRound(initialRound);
  const { game, picks, refresh } = useGame({ game: initialGame, picks: initialPicks });
  const teamName = useCallback((id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`, [teams]);
  const lineups = useMemo(() => lineupsFromPicks(picks), [picks]);
  const [tab, setTab] = useState<'live' | 'draft'>(game.status === 'done' ? 'live' : 'draft');
  const me = game.order.includes(myTeamId) ? myTeamId : game.order[0];
  const others = game.order.filter((t) => t !== me);
  const [opp, setOpp] = useState(others[0]);
  useEffect(() => { if (game.status === 'done') setTab('live'); }, [game.status]);
  return (
    <Shell title={game.name} sub={<>{data.name} · {game.order.length} clubs · snake draft</>}
      right={<LiveChip live={game.status === 'drafting' || liveNow} text={game.status === 'drafting' ? 'Drafting' : liveNow ? 'Live' : data.status === 'completed' ? 'Final' : 'Pre-game'} />}>
      <div className="rh-seg big" role="tablist">
        <button role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>Matchup</button>
        <button role="tab" aria-selected={tab === 'draft'} className={tab === 'draft' ? 'on' : ''} onClick={() => setTab('draft')}>Draft</button>
      </div>
      {tab === 'draft'
        ? <DraftRoom game={game} picks={picks} refresh={refresh} players={data.players} teamName={teamName} myTeamId={myTeamId} canManage={canManage} />
        : game.status !== 'done' ? <Empty>The draft is still going. Scores show here once every club has its 11.</Empty>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {game.order.length > 2 && <Leaderboard order={game.order} lineups={lineups} byId={byId} gameBySquad={gameBySquad} teamName={teamName} myTeamId={myTeamId} selected={opp} onPick={(t) => t !== me && setOpp(t)} />}
            {game.order.length > 2 && <span className="rh-dim" style={{ fontSize: 12 }}>Tap a club to see your matchup against them.</span>}
            <HeadToHead gameId={game.id} me={me} opp={opp} lineups={lineups} byId={byId} gameBySquad={gameBySquad} teamName={teamName} myTeamId={myTeamId} liveNow={liveNow} />
          </div>
        )}
    </Shell>
  );
}

/* ---------------- live scores ---------------- */

export function ScoresBoard({ initial }: { initial: LRound }) {
  const { data, at, liveNow } = useRound(initial);
  const router = useRouter();
  const games = [...data.games].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.date.localeCompare(b.date));
  return (
    <Shell title="Live scores" sub={<>{data.name} · updated {at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: PERTH })} Perth</>}
      right={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="rh-select sm" value={data.round} onChange={(e) => router.push(`/live/scores?round=${e.target.value}`)} aria-label="Round">
          {data.rounds.map((r) => <option key={r.n} value={r.n}>{r.name}</option>)}
        </select>
        <LiveChip live={liveNow} text={liveNow ? 'Live' : data.status === 'completed' ? 'Final' : 'Pre-game'} />
      </div>}>
      <div className="rh-games">
        {games.map((g) => {
          const top = (sid: number) => data.players.filter((p) => p.squadId === sid && (p.score != null || g.status === 'scheduled'))
            .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.avg ?? 0) - (a.avg ?? 0)).slice(0, 5);
          const hw = (g.homeScore ?? 0) > (g.awayScore ?? 0), aw = (g.awayScore ?? 0) > (g.homeScore ?? 0);
          return (
            <section key={g.id} className={`rh-card rh-game ${isLive(g) ? 'live' : ''}`}>
              <div className="rh-game-head">
                <span className="rh-dim" style={{ fontSize: 12 }}>{isLive(g) && <i className="rh-pulse" />}{gameLabel(g)}</span>
              </div>
              {[[g.home, g.homeScore, hw, g.homeId], [g.away, g.awayScore, aw, g.awayId]].map(([abbr, sc, lead, sid]) => (
                <div key={String(sid)} className="rh-game-team">
                  <div className={`rh-game-score ${lead ? 'lead' : ''}`}><span>{abbr as string}</span><b>{(sc as number | null) ?? ''}</b></div>
                  <div className="rh-game-top">
                    {top(sid as number).map((p) => <span key={p.id}><span className="rh-ellip">{p.name}</span><b className={p.score != null && p.score >= 100 ? 'rh-up' : ''}>{p.score ?? <span className="rh-dim">{p.avg?.toFixed(0)}</span>}</b></span>)}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
