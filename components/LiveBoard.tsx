'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SLOTS, type LGame, type LPlayer, type LRound, type Lineup, type Slot } from '@/lib/aflw';
import { saveLineup, saveMatchup, type Mini } from '@/app/(app)/live/actions';

type TeamRow = { id: number; name: string; short_code: string };
const SLOT_ORDER = Object.keys(SLOTS) as Slot[];
const SLOT_COLOR: Record<Slot, string> = { DEF: 'var(--def)', MID: 'var(--mid)', RUC: 'var(--ruc)', FWD: 'var(--fwd)' };
const POLL_MS = 25_000;

const isLive = (g?: LGame) => !!g && g.status !== 'scheduled' && g.status !== 'completed';
function gameLabel(g?: LGame) {
  if (!g) return 'No game';
  if (g.status === 'completed') return 'Full time';
  if (g.status === 'scheduled') return new Date(g.date).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Perth' });
  const m = Math.floor((g.periodSeconds ?? 0) / 60), s = (g.periodSeconds ?? 0) % 60;
  return `Q${g.period ?? '?'} ${m}:${String(s).padStart(2, '0')}`;
}

export function LiveBoard({ initial, teams, mini, myTeamId, isCommish }: { initial: LRound; teams: TeamRow[]; mini: Mini; myTeamId: number; isCommish: boolean }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [updated, setUpdated] = useState(new Date(initial.fetchedAt));
  const [tab, setTab] = useState<'mini' | 'games'>('mini');
  const [lineups, setLineups] = useState<Record<number, Lineup>>(mini.lineups);
  const [matchups, setMatchups] = useState(mini.matchups);

  // Poll while the round isn't finished
  useEffect(() => {
    if (data.status === 'completed') return;
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/live?round=${data.round}`, { cache: 'no-store' });
        if (r.ok && !stop) { const d = await r.json() as LRound; setData(d); setUpdated(new Date()); }
      } catch { /* try again next tick */ }
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [data.round, data.status]);

  const byId = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const gameBySquad = useMemo(() => {
    const m = new Map<number, LGame>();
    for (const g of data.games) { m.set(g.homeId, g); m.set(g.awayId, g); }
    return m;
  }, [data.games]);
  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const liveNow = data.games.some(isLive);
  const ownerOf = useMemo(() => {
    const m = new Map<number, number>();
    for (const [t, l] of Object.entries(lineups)) for (const s of SLOT_ORDER) for (const id of l[s] ?? []) m.set(id, Number(t));
    return m;
  }, [lineups]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <select value={data.round} onChange={(e) => router.push(`/live?round=${e.target.value}`)} aria-label="Round"
          style={{ minHeight: 36, borderRadius: 8, border: '1px solid var(--line)', padding: '0 10px', background: 'var(--surface)' }}>
          {data.rounds.map((r) => <option key={r.n} value={r.n}>{r.name}{r.status === 'completed' ? '' : r.status === 'scheduled' ? ' (upcoming)' : ' (live)'}</option>)}
        </select>
        <div role="tablist" style={{ display: 'flex', gap: 4 }}>
          <button role="tab" aria-selected={tab === 'mini'} className={`btn${tab === 'mini' ? ' dark' : ''}`} onClick={() => setTab('mini')}>Mini game</button>
          <button role="tab" aria-selected={tab === 'games'} className={`btn${tab === 'games' ? ' dark' : ''}`} onClick={() => setTab('games')}>All games</button>
        </div>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {liveNow && <span className="live-dot" aria-hidden="true" />}
          {data.status === 'completed' ? 'Final scores' : liveNow ? 'Live' : 'Waiting for the first bounce'} · updated {updated.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Australia/Perth' })} (Perth)
        </span>
      </div>

      {tab === 'mini'
        ? <MiniGame round={data.round} ready={mini.ready} teams={teams} teamName={teamName} lineups={lineups} setLineups={setLineups}
            matchups={matchups} setMatchups={setMatchups} byId={byId} gameBySquad={gameBySquad} players={data.players}
            ownerOf={ownerOf} myTeamId={myTeamId} isCommish={isCommish} />
        : <Games data={data} ownerOf={ownerOf} teams={teams} />}
    </div>
  );
}

/* ---------- mini game ---------- */

function totals(l: Lineup | undefined, byId: Map<number, LPlayer>, gameBySquad: Map<number, LGame>) {
  let score = 0, proj = 0, left = 0;
  for (const s of SLOT_ORDER) for (const id of l?.[s] ?? []) {
    const p = byId.get(id); if (!p) continue;
    const g = gameBySquad.get(p.squadId);
    score += p.score ?? 0;
    if (g?.status === 'completed') proj += p.score ?? 0;
    else if (isLive(g)) {
      // score so far plus his average for the share of the game still to come (AFLW quarters run about 18 minutes)
      const done = Math.min(1, ((g!.period ?? 1) - 1 + Math.min(1, (g!.periodSeconds ?? 0) / 1080)) / 4);
      proj += (p.score ?? 0) + (p.avg ?? 0) * (1 - done); left++;
    }
    else { proj += p.avg ?? 0; left++; }
  }
  return { score, proj: Math.round(proj), left };
}

function MiniGame(props: {
  round: number; ready: boolean; teams: TeamRow[]; teamName: (id: number) => string;
  lineups: Record<number, Lineup>; setLineups: (f: (l: Record<number, Lineup>) => Record<number, Lineup>) => void;
  matchups: { home: number; away: number }[]; setMatchups: (m: { home: number; away: number }[]) => void;
  byId: Map<number, LPlayer>; gameBySquad: Map<number, LGame>; players: LPlayer[]; ownerOf: Map<number, number>; myTeamId: number; isCommish: boolean;
}) {
  const { ready, matchups, isCommish } = props;
  if (!ready) return (
    <div className="card" style={{ padding: 18 }}>
      {isCommish ? 'The mini game needs its two tables. Run supabase/migrations/0009_live_mini.sql in the Supabase SQL editor, then reload.' : 'The mini game isn’t set up yet.'}
    </div>
  );
  const mine = matchups.filter((m) => m.home === props.myTeamId || m.away === props.myTeamId);
  const ordered = [...mine, ...matchups.filter((m) => !mine.includes(m))];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {ordered.length === 0 && <div className="card" style={{ padding: 18 }}>No matchups for this round yet.{isCommish ? ' Set them up below.' : ' The commish will set them before the first bounce.'}</div>}
      {ordered.map((m) => <MatchCard key={m.home} m={m} {...props} />)}
      {isCommish && <CommishTools {...props} />}
    </div>
  );
}

function MatchCard({ m, lineups, byId, gameBySquad, teamName }: { m: { home: number; away: number } } & Parameters<typeof MiniGame>[0]) {
  const a = totals(lineups[m.home], byId, gameBySquad), b = totals(lineups[m.away], byId, gameBySquad);
  const done = a.left === 0 && b.left === 0 && (a.score + b.score) > 0;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="mini-head">
        <TeamTotal name={teamName(m.home)} t={a} win={done && a.score > b.score} />
        <span className="muted mono" style={{ fontSize: 12 }}>v</span>
        <TeamTotal name={teamName(m.away)} t={b} win={done && b.score > a.score} right />
      </div>
      <div className="mini-sides">
        <Side name={teamName(m.home)} l={lineups[m.home]} byId={byId} gameBySquad={gameBySquad} />
        <Side name={teamName(m.away)} l={lineups[m.away]} byId={byId} gameBySquad={gameBySquad} />
      </div>
    </div>
  );
}

function TeamTotal({ name, t, win, right }: { name: string; t: { score: number; proj: number; left: number }; win: boolean; right?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start', minWidth: 0, flex: 1 }}>
      <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{win ? '🏆 ' : ''}{name}</span>
      <b style={{ font: '600 32px var(--font)', letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: win ? 'var(--g5)' : undefined }}>{t.score}</b>
      <span className="muted" style={{ fontSize: 11 }}>{t.left > 0 ? `projected ${t.proj} · ${t.left} to play` : 'final'}</span>
    </div>
  );
}

function Side({ name, l, byId, gameBySquad }: { name: string; l?: Lineup; byId: Map<number, LPlayer>; gameBySquad: Map<number, LGame> }) {
  const head = <span className="eyebrow" style={{ padding: '8px 12px 4px' }}>{name}</span>;
  if (!l || !SLOT_ORDER.some((s) => l[s]?.length)) return <div style={{ display: 'flex', flexDirection: 'column' }}>{head}<span className="muted" style={{ padding: '6px 12px 14px', fontSize: 13 }}>No team picked yet.</span></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head}
      {SLOT_ORDER.flatMap((s) => Array.from({ length: SLOTS[s] }, (_, i) => {
        const p = byId.get(l[s]?.[i] ?? -1); const g = p ? gameBySquad.get(p.squadId) : undefined;
        return (
          <div key={s + i} className="mini-row">
            <span className="pill" style={{ background: SLOT_COLOR[s], color: '#fff', minWidth: 34, textAlign: 'center' }}>{s}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name ?? <span className="muted">Empty</span>}</span>
              {p && <span className="muted" style={{ fontSize: 11 }}>{p.squad} · {isLive(g) ? <b style={{ color: 'var(--g5)' }}>{gameLabel(g)}</b> : gameLabel(g)}</span>}
            </span>
            <span className="mono" style={{ fontWeight: 600, fontSize: 15, minWidth: 34, textAlign: 'right' }}>
              {p?.score != null ? p.score : <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{p?.avg != null ? `~${Math.round(p.avg)}` : '–'}</span>}
            </span>
          </div>
        );
      }))}
    </div>
  );
}

function CommishTools({ round, teams, teamName, lineups, setLineups, matchups, setMatchups, players, ownerOf }: Parameters<typeof MiniGame>[0]) {
  const [home, setHome] = useState(teams[0]?.id ?? 0);
  const [away, setAway] = useState(teams[1]?.id ?? 0);
  const [editing, setEditing] = useState<number>(teams[0]?.id ?? 0);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inMatch = new Set(matchups.flatMap((m) => [m.home, m.away]));

  const addMatch = () => start(async () => {
    if (inMatch.has(home) || inMatch.has(away)) { setMsg('One of those clubs already has a matchup this round.'); return; }
    const r = await saveMatchup(round, home, away);
    if (r.ok) { setMatchups([...matchups, { home, away }]); setMsg(null); } else setMsg(r.error ?? 'Couldn’t save.');
  });
  const removeMatch = (h: number) => start(async () => {
    const m = matchups.find((x) => x.home === h)!;
    const r = await saveMatchup(round, m.home, m.away, true);
    if (r.ok) setMatchups(matchups.filter((x) => x.home !== h)); else setMsg(r.error ?? 'Couldn’t remove.');
  });

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span className="eyebrow">Commish · round {round} setup</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b>Matchups</b>
        {matchups.map((m) => (
          <div key={m.home} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span>{teamName(m.home)} v {teamName(m.away)}</span>
            <button className="btn" style={{ minHeight: 28 }} disabled={pending} onClick={() => removeMatch(m.home)}>Remove</button>
          </div>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <TeamSelect teams={teams} value={home} onChange={setHome} />
          <span className="muted">v</span>
          <TeamSelect teams={teams} value={away} onChange={setAway} />
          <button className="btn dark" disabled={pending || home === away} onClick={addMatch}>Add matchup</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>Pick a team</b>
          <TeamSelect teams={teams} value={editing} onChange={setEditing} />
        </div>
        <TeamEditor key={editing} round={round} teamId={editing} lineup={lineups[editing] ?? {}} players={players} ownerOf={ownerOf} teamName={teamName}
          onSaved={(l) => setLineups((all) => ({ ...all, [editing]: l }))} />
      </div>
      {msg && <span style={{ color: 'var(--red-fg)', fontSize: 13 }}>{msg}</span>}
    </div>
  );
}

function TeamSelect({ teams, value, onChange }: { teams: TeamRow[]; value: number; onChange: (n: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ minHeight: 34, borderRadius: 8, border: '1px solid var(--line)', padding: '0 8px', background: 'var(--surface)', maxWidth: 220 }}>
      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}

function TeamEditor({ round, teamId, lineup, players, ownerOf, teamName, onSaved }: {
  round: number; teamId: number; lineup: Lineup; players: LPlayer[]; ownerOf: Map<number, number>; teamName: (id: number) => string; onSaved: (l: Lineup) => void;
}) {
  const [l, setL] = useState<Lineup>(lineup);
  const [open, setOpen] = useState<{ s: Slot; i: number } | null>(null);
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const byId = new Map(players.map((p) => [p.id, p]));
  const chosen = new Set(SLOT_ORDER.flatMap((s) => l[s] ?? []));
  const filled = SLOT_ORDER.reduce((n, s) => n + (l[s]?.length ?? 0), 0);

  const set = (s: Slot, i: number, id: number | null) => {
    const arr = [...(l[s] ?? [])];
    if (id == null) arr.splice(i, 1); else arr[i] = id;
    setL({ ...l, [s]: arr.filter(Boolean) });
    setOpen(null); setQ('');
  };
  const options = open ? players
    .filter((p) => p.pos.includes(open.s) && !chosen.has(p.id) && p.status !== 'injured')
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.squad.toLowerCase() === q.toLowerCase())
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)).slice(0, 40) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {SLOT_ORDER.flatMap((s) => Array.from({ length: SLOTS[s] }, (_, i) => {
        const p = byId.get(l[s]?.[i] ?? -1);
        const isOpen = open?.s === s && open.i === i;
        return (
          <div key={s + i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="mini-row" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
              <span className="pill" style={{ background: SLOT_COLOR[s], color: '#fff', minWidth: 34, textAlign: 'center' }}>{s}</span>
              <span style={{ flex: 1 }}>{p ? <>{p.name} <span className="muted" style={{ fontSize: 12 }}>{p.squad} · avg {p.avg?.toFixed(0) ?? '–'}</span></> : <span className="muted">Empty</span>}</span>
              <button className="btn" style={{ minHeight: 28 }} onClick={() => { setOpen(isOpen ? null : { s, i }); setQ(''); }}>{p ? 'Change' : 'Pick'}</button>
              {p && <button className="btn" style={{ minHeight: 28 }} onClick={() => set(s, i, null)} aria-label={`Remove ${p.name}`}>✕</button>}
            </div>
            {isOpen && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--sunk)' }}>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${s}s by name or club (e.g. NM)`}
                  style={{ minHeight: 34, borderRadius: 6, border: '1px solid var(--line)', padding: '0 10px' }} />
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {options.map((o) => {
                    const owner = ownerOf.get(o.id);
                    const taken = owner != null && owner !== teamId;
                    return (
                      <button key={o.id} disabled={taken} onClick={() => set(s, i, o.id)} className="pick-opt">
                        <span>{o.name} <span className="muted" style={{ fontSize: 12 }}>{o.squad} · {o.pos.join('/')}</span></span>
                        <span className="mono muted" style={{ fontSize: 12 }}>{taken ? `with ${teamName(owner!)}` : `avg ${o.avg?.toFixed(0) ?? '–'}`}</span>
                      </button>
                    );
                  })}
                  {options.length === 0 && <span className="muted" style={{ fontSize: 13, padding: 6 }}>No eligible players match.</span>}
                </div>
              </div>
            )}
          </div>
        );
      }))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
        <button className="btn green" disabled={pending} onClick={() => start(async () => {
          const r = await saveLineup(round, teamId, l);
          if (r.ok) { onSaved(l); setMsg(`Saved (${filled} of 11).`); } else setMsg(r.error ?? 'Couldn’t save.');
        })}>Save team</button>
        <span className="muted" style={{ fontSize: 12 }}>{msg ?? `${filled} of 11 picked. A player can only be in one club’s 11 each round.`}</span>
      </div>
    </div>
  );
}

/* ---------- all games ---------- */

function Games({ data, ownerOf, teams }: { data: LRound; ownerOf: Map<number, number>; teams: TeamRow[] }) {
  const short = (id: number) => teams.find((t) => t.id === id)?.short_code ?? '';
  const games = [...data.games].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.date.localeCompare(b.date));
  return (
    <div className="live-games">
      {games.map((g) => {
        const side = (sid: number) => data.players.filter((p) => p.squadId === sid && (p.score != null || g.status === 'scheduled'))
          .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.avg ?? 0) - (a.avg ?? 0)).slice(0, g.status === 'scheduled' ? 6 : 22);
        return (
          <div key={g.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontSize: 15 }}>{g.home} {g.homeScore ?? ''}</b><span className="muted">v</span><b style={{ fontSize: 15 }}>{g.away} {g.awayScore ?? ''}</b>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: isLive(g) ? 'var(--g5)' : 'var(--muted)', fontWeight: isLive(g) ? 600 : 400 }}>{isLive(g) && <span className="live-dot" />} {gameLabel(g)}</span>
            </div>
            {g.status === 'scheduled' && <span className="muted" style={{ fontSize: 12 }}>Top scorers by average:</span>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[g.homeId, g.awayId].map((sid) => (
                <div key={sid} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {side(sid).map((p) => {
                    const o = ownerOf.get(p.id);
                    return (
                      <span key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12.5 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}{o != null && <span className="pill" style={{ marginLeft: 4, background: 'var(--ribbon)', fontSize: 9 }}>{short(o)}</span>}</span>
                        <span className="mono" style={{ fontWeight: p.score != null && p.score >= 100 ? 700 : 500 }}>{p.score ?? <span className="muted">{p.avg?.toFixed(0) ?? '–'}</span>}</span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
