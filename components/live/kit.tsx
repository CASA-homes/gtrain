'use client';
// Live Matchups UI kit: dark, minimal, one green for winning and one orange for losing.
import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { duelFits, picksPerTeam, type LProfile, SLOTS, lineupsFromPicks, payouts, type Prize, onClock, slotFor, type GamePick, type GameRow, type LGame, type LPlayer, type LRound, type Lineup, type Slot } from '@/lib/aflw';
import { deleteGame, loadGame, makePick, undoPick } from '@/app/(app)/live/actions';
import { CLUBS } from '@/lib/clubs';

export type TeamRow = { id: number; name: string; short_code: string };
export const SLOT_ORDER = Object.keys(SLOTS) as Slot[];
const SLOT_NAME: Record<Slot, string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forwards' };
const PERTH = 'Australia/Perth';
const cssVar = (name: string, value: string) => ({ [name]: value }) as React.CSSProperties;
// AFLW Fantasy squad codes that differ from the men's codes in lib/clubs
const SQUAD_CODE: Record<string, string> = { BL: 'BRL', GC: 'GCS', NM: 'NTH', PA: 'PTA', WB: 'WBD' };
/** Headshot in a small circle with a club-colour ring (same look as the men's side). Falls back to initials. */
export function Face({ p, size = 30 }: { p: { id: number; name: string; squad: string }; size?: number }) {
  const [bad, setBad] = useState(false);
  const c = CLUBS[SQUAD_CODE[p.squad] ?? p.squad];
  const ring = c ? (c.m ? `conic-gradient(${c.a} 0 45%, ${c.m} 45% 55%, ${c.b} 55% 100%)` : `conic-gradient(${c.a} 0 50%, ${c.b} 50% 100%)`) : '#2a302d';
  return (
    <span className="rh-face" style={{ width: size, height: size, background: ring }} aria-hidden="true">
      <span>{bad ? p.name.split(' ').map((w) => w[0]).slice(0, 2).join('') : <img src={`https://fantasy.afl.com.au/media/aflw_fantasy/players/${p.id}_100.webp`} alt="" loading="lazy" onError={() => setBad(true)}
        ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setBad(true); }} />}</span>
    </span>
  );
}
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

/** One player's projected final: her score if done, score plus average for what's left if live, else her average. */
export function projOf(p: LPlayer | undefined, g?: LGame, mult = 1): number | null {
  if (!p) return null;
  if (g?.status === 'completed') return (p.score ?? 0) * mult;
  if (isLive(g)) { const done = Math.min(1, ((g!.period ?? 1) - 1 + Math.min(1, (g!.periodSeconds ?? 0) / 1080)) / 4); return Math.round(((p.score ?? 0) + (p.avg ?? 0) * (1 - done)) * mult); }
  return p.avg != null ? Math.round(p.avg * mult) : null;
}
/** PROJ (faint) and SCORE (green) side by side; mirrored on the right. */
export function Nums({ proj, score, right }: { proj: number | null; score: number | null; right?: boolean }) {
  const pj = <span className="rh-proj">{proj ?? ''}</span>, sc = <span className={`rh-score ${score == null ? 'none' : ''}`}>{score ?? '–'}</span>;
  return right ? <>{sc}{pj}</> : <>{pj}{sc}</>;
}
export function NumsHead() {
  return <div className="rh-row rh-row-head"><span /><span>PROJ</span><span>SCORE</span><span /><span>SCORE</span><span>PROJ</span><span /></div>;
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
export function Shell({ title, sub, right, children, compact }: { title: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; compact?: boolean }) {
  const path = usePathname();
  const [navh, setNavh] = useState(56);
  useEffect(() => {
    const nav = document.querySelector('.nav') as HTMLElement | null;
    const f = () => setNavh(nav?.offsetHeight ?? 56);
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f);
  }, []);
  // Tap any player (anything marked data-pid) for their profile.
  const [sheet, setSheet] = useState<number | null>(null);
  return (
    <div className={`rh ${compact ? 'compact' : ''}`} style={cssVar('--navh', `${navh}px`)}
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest('[data-pid]') as HTMLElement | null;
        if (el && !(e.target as HTMLElement).closest('button, a, select, input')) setSheet(Number(el.dataset.pid));
      }}>
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
      {sheet != null && <PlayerSheet id={sheet} onClose={() => setSheet(null)} />}
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

export function HeadToHead({ gameId, me, opp, lineups, byId, gameBySquad, teamName, myTeamId, liveNow, flat }: {
  gameId: number; me: number; opp: number; lineups: Record<number, Lineup>; byId: Map<number, LPlayer>; gameBySquad: Map<number, LGame>;
  teamName: (id: number) => string; myTeamId: number; liveNow: boolean;
  /** Duel: each club's players in pick order, no position lines. */
  flat?: { me: number[]; opp: number[] };
}) {
  const a = totals(lineups[me], byId, gameBySquad), b = totals(lineups[opp], byId, gameBySquad);
  const done = a.left === 0 && b.left === 0 && a.score + b.score > 0;
  const margin = a.score - b.score, pm = a.proj - b.proj;
  const up = (a.score + b.score > 0 ? margin : pm) >= 0;
  const share = a.proj + b.proj > 0 ? a.proj / (a.proj + b.proj) : 0.5;
  return (
    <section className="rh-card rh-h2h">
      <div className="rh-h2h-top">
        <div className="rh-side">
          <span className="rh-side-n">{teamName(me)}{me === myTeamId && <em>you</em>}</span>
          <b className={`rh-big ${up ? 'up' : ''}`}>{a.score}</b>
        </div>
        <div className="rh-mid">
          <span className={`rh-delta ${up ? 'up' : 'down'}`}>{a.score + b.score === 0 ? signed(pm) : signed(margin)}</span>
          <span className="rh-dim">{a.score + b.score === 0 ? 'projected' : done ? 'final' : `proj ${signed(pm)}`}</span>
          <div className="rh-winbar" title={`${Math.round(share * 100)}% of projected points`}><span style={{ width: `${share * 100}%` }} className={up ? 'up' : 'down'} /></div>
          <span className="rh-dim">{a.left + b.left > 0 ? `${a.left} v ${b.left} to play` : 'all done'}</span>
        </div>
        <div className="rh-side r">
          <span className="rh-side-n">{teamName(opp)}</span>
          <b className={`rh-big ${!up ? 'down' : 'dim'}`}>{b.score}</b>
        </div>
      </div>
      <MarginChart id={`${gameId}-${me}-${opp}`} margin={a.score + b.score === 0 ? pm : margin} live={liveNow} />
      <div className="rh-rows">
        <NumsHead />
        {flat && Array.from({ length: Math.max(flat.me.length, flat.opp.length) }, (_, i) => {
          const pa = byId.get(flat.me[i] ?? -1), pb = byId.get(flat.opp[i] ?? -1);
          const cell = (p: LPlayer | undefined, right: boolean) => {
            const g = p ? gameBySquad.get(p.squadId) : undefined;
            const name = (
              <span className={`rh-who ${right ? 'r' : ''}`} data-pid={p?.id}>
                {p && <Face p={p} size={28} />}
                <span className={`rh-pl ${right ? 'r' : ''}`}>
                  <span className="rh-pl-n">{p?.name ?? '—'}</span>
                  {p && <span className="rh-pl-m">{p.squad} · {p.pos.join('/')}</span>}
                </span>
              </span>
            );
            const num = <Nums proj={projOf(p, g)} score={p?.score ?? null} right={right} />;
            return right ? <>{num}{name}</> : <>{name}{num}</>;
          };
          return <div key={i} className="rh-row">{cell(pa, false)}<span className="rh-slot" style={cssVar('--c', '#8fd18f')}>{i + 1}</span>{cell(pb, true)}</div>;
        })}
        {!flat && SLOT_ORDER.map((s) => (
          <Fragment key={s}>
            {Array.from({ length: SLOTS[s] }, (_, i) => {
              const pa = byId.get(lineups[me]?.[s]?.[i] ?? -1), pb = byId.get(lineups[opp]?.[s]?.[i] ?? -1);
              const sa = pa?.score ?? null, sb = pb?.score ?? null;
              const cell = (p: LPlayer | undefined, sc: number | null, other: number | null, right: boolean) => {
                const g = p ? gameBySquad.get(p.squadId) : undefined;
                const name = (
                  <span className={`rh-who ${right ? 'r' : ''}`} data-pid={p?.id}>
                    {p && <Face p={p} size={28} />}
                    <span className={`rh-pl ${right ? 'r' : ''}`}>
                      <span className="rh-pl-n">{p?.name ?? '—'}</span>
                      {p && <span className="rh-pl-m">{p.squad} · <span className={isLive(g) ? 'rh-on' : ''}>{gameLabel(g)}</span></span>}
                    </span>
                  </span>
                );
                const num = <Nums proj={projOf(p, g)} score={sc} right={right} />;
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

export function DraftRoom({ game, picks, refresh, players: allPlayers, gamesOfRound = [], teamName, myTeamId, canManage }: {
  game: GameRow; picks: GamePick[]; refresh: () => Promise<void>; players: LPlayer[]; gamesOfRound?: LGame[]; teamName: (id: number) => string; myTeamId: number; canManage: boolean;
}) {
  const router = useRouter();
  const per = picksPerTeam(game.kind), duel = game.kind === 'duel5';
  const n = game.order.length, total = n * per, k = picks.length;
  const match = duel ? gamesOfRound.find((g) => g.id === game.match_id) ?? null : null;
  const done = game.status === 'done' || k >= total;
  const clockTeam = done ? null : onClock(game.order, k);
  const mine = clockTeam === myTeamId;
  const canPick = !done && (mine || canManage);
  const inGame = game.order.includes(myTeamId);
  const [view, setView] = useState(inGame ? myTeamId : game.order[0]);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<Slot | 'ALL'>('ALL');
  const [side, setSide] = useState<number | 'ALL'>('ALL');
  // A duel only uses the two sides in its match.
  const players = useMemo(() => (match ? allPlayers.filter((p) => p.squadId === match.homeId || p.squadId === match.awayId) : allPlayers), [allPlayers, match]);
  const [onlyFit, setOnlyFit] = useState(true);
  const [limit, setLimit] = useState(40);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const last = picks[picks.length - 1];
  const clock = useClock(last?.picked_at ?? game.created_at);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const taken = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const picksOf = (t: number) => picks.filter((p) => p.team_id === t);
  const squadOfPick = (pk: GamePick) => byId.get(pk.player_id)?.squadId ?? 0;
  const fits = (p: LPlayer, t: number | null) => t != null && (duel
    ? duelFits(p.squadId, picksOf(t).map(squadOfPick), match)
    : slotFor(p.pos, picksOf(t)) != null);
  const pool = players
    .filter((p) => !taken.has(p.id) && p.status !== 'injured')
    .filter((p) => pos === 'ALL' || p.pos.includes(pos))
    .filter((p) => side === 'ALL' || p.squadId === side)
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
        <span className="rh-clock-k">{done ? 'Draft complete' : mine ? 'Your pick' : 'On the clock'}</span>
        <b className="rh-clock-team">{done ? `${total} picks in` : teamName(clockTeam!)}</b>
        {!done && <span className="rh-dim rh-clock-meta">#{k + 1}/{total} · <span className="rh-mono">{clock}</span>{!mine && nextMine != null && <> · you {nextMine - k === 1 ? 'next' : `in ${nextMine - k}`}</>}</span>}
        {last && <span className="rh-clock-last"><span className="rh-dim">Last</span> <b>{last.player_name}</b> <span className="rh-dim">→ {teamName(last.team_id)}</span></span>}
      </div>

      <div className="rh-dgrid">
        <aside className="rh-dleft">
          <div className="rh-card rh-field-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="rh-k">{view === myTeamId ? 'Your team' : 'Team'} · {viewPicks.length}/{per}</span>
              <select value={view} onChange={(e) => setView(Number(e.target.value))} className="rh-select sm">
                {game.order.map((t) => <option key={t} value={t}>{teamName(t)}{t === myTeamId ? ' (you)' : ''}</option>)}
              </select>
            </div>
            {duel && match ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {Array.from({ length: per }, (_, i) => {
                  const pk = viewPicks[i]; const pl = pk ? byId.get(pk.player_id) : undefined;
                  return <div key={i} className="rh-feed" data-pid={pl?.id}>{pl ? <><Face p={pl} size={24} /><b>{pl.name}</b><span className="rh-dim">{pl.squad} · {pl.avg?.toFixed(0) ?? ''}</span></> : <span className="rh-dim">Pick {i + 1}</span>}</div>;
                })}
                <span className="rh-dim" style={{ fontSize: 12 }}>
                  {match.home} {viewPicks.filter((pk) => squadOfPick(pk) === match.homeId).length} · {match.away} {viewPicks.filter((pk) => squadOfPick(pk) === match.awayId).length} · need 2+ from each
                </span>
              </div>
            ) : <Oval picks={viewPicks} byId={byId} />}
            <div className="rh-dim hide-sm rh-avgtot">
              <span>Avg total <b style={{ color: 'var(--rh-text)' }}>{Math.round(viewPicks.reduce((s, p) => s + (byId.get(p.player_id)?.avg ?? 0), 0))}</b></span>
            </div>
          </div>
        </aside>

        <section className="rh-card rh-pool">
          <div className="rh-pool-ctl">
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} placeholder="Search players or clubs" className="rh-input" aria-label="Search players" />
            {duel && match ? (
              <div className="rh-seg">
                {([['ALL', 'Both sides'], [match.homeId, match.home], [match.awayId, match.away]] as [number | 'ALL', string][]).map(([v, l]) => <button key={String(v)} className={side === v ? 'on' : ''} onClick={() => { setSide(v); setLimit(40); }}>{l}</button>)}
              </div>
            ) : (
              <div className="rh-seg">
                {(['ALL', ...SLOT_ORDER] as (Slot | 'ALL')[]).map((s) => <button key={s} className={pos === s ? 'on' : ''} onClick={() => { setPos(s); setLimit(40); }}>{s === 'ALL' ? 'All' : s}</button>)}
              </div>
            )}
            {!done && <label className="rh-toggle"><input type="checkbox" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} /><span />{duel ? 'Only legal picks' : 'Only open spots'}</label>}
          </div>
          {msg && <div className={`rh-toast ${msg.ok ? 'up' : 'down'}`}>{msg.text}</div>}
          <div className="rh-list">
            <div className="rh-lrow head"><span>Player</span><span>Avg</span><span className="hide-sm">L3</span><span className="hide-sm">High</span><span /></div>
            {pool.slice(0, limit).map((p) => {
              const ok = canPick && fits(p, clockTeam);
              return (
                <div key={p.id} className="rh-lrow">
                  <span className="rh-who" data-pid={p.id}><Face p={p} size={34} /><span className="rh-pl">
                    <span className="rh-pl-n">{p.name}</span>
                    <span className="rh-pl-m">{p.squad} · {p.pos.map((x) => <b key={x} style={{ color: SLOT_HUE[x as Slot] }}>{x} </b>)}{p.status === 'uncertain' && <em className="rh-doubt">doubt</em>}</span>
                  </span></span>
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

      <Board order={game.order} picks={picks} k={done ? -1 : k} per={per} teamName={teamName} myTeamId={myTeamId} />

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
                ? <span key={i} className="rh-ps on" data-pid={p.player_id} style={cssVar('--c', SLOT_HUE[s])}>{byId.get(p.player_id) && <Face p={byId.get(p.player_id)!} size={24} />}<b>{surname(p.player_name)}</b><em>{byId.get(p.player_id)?.avg?.toFixed(0) ?? ''}</em></span>
                : <span key={i} className="rh-ps" style={cssVar('--c', SLOT_HUE[s])}>{s}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function Board({ order, picks, k, per, teamName, myTeamId }: { order: number[]; picks: GamePick[]; k: number; per: number; teamName: (id: number) => string; myTeamId: number }) {
  const n = order.length;
  const at = new Map(picks.map((p) => [p.pick_no, p]));
  return (
    <section className="rh-card" style={{ gap: 10 }}>
      <span className="rh-k">Draft board</span>
      <div style={{ overflowX: 'auto' }}>
        <div className="rh-board" style={{ gridTemplateColumns: `30px repeat(${n}, minmax(100px, 1fr))` }}>
          <span />
          {order.map((t) => <span key={t} className={`rh-bh ${t === myTeamId ? 'me' : ''}`}>{teamName(t)}</span>)}
          {Array.from({ length: per }, (_, r) => (
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
    <Shell compact title={game.name} sub={<>{data.name} · {game.kind === 'duel5' ? (() => { const m = data.games.find((g) => g.id === game.match_id); return m ? `Duel · ${m.home} v ${m.away}` : 'Duel'; })() : `${game.order.length} clubs`}</>}
      right={<div className="rh-headright">
        <div className="rh-seg" role="tablist">
          <button role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>Matchup</button>
          <button role="tab" aria-selected={tab === 'draft'} className={tab === 'draft' ? 'on' : ''} onClick={() => setTab('draft')}>Draft</button>
        </div>
        <LiveChip live={game.status === 'drafting' || liveNow} text={game.status === 'drafting' ? 'Drafting' : liveNow ? 'Live' : data.status === 'completed' ? 'Final' : 'Pre-game'} />
      </div>}>
      <PrizeStrip prize={game.prize} clubs={game.order.length} final={game.status === 'done' && data.games.every((g) => g.status === 'completed')} teamName={teamName} myTeamId={myTeamId}
        standings={[...game.order].sort((x, y) => totals(lineups[y], byId, gameBySquad).score - totals(lineups[x], byId, gameBySquad).score)} />
      {tab === 'draft'
        ? <DraftRoom game={game} picks={picks} refresh={refresh} players={data.players} gamesOfRound={data.games} teamName={teamName} myTeamId={myTeamId} canManage={canManage} />
        : game.status !== 'done' ? <Empty>The draft is still going. Scores show here once every club has its {picksPerTeam(game.kind)}.</Empty>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {game.order.length > 2 && <Leaderboard order={game.order} lineups={lineups} byId={byId} gameBySquad={gameBySquad} teamName={teamName} myTeamId={myTeamId} selected={opp} onPick={(t) => t !== me && setOpp(t)} />}
            <HeadToHead gameId={game.id} me={me} opp={opp} lineups={lineups} byId={byId} gameBySquad={gameBySquad} teamName={teamName} myTeamId={myTeamId} liveNow={liveNow}
              flat={game.kind === 'duel5' ? { me: picks.filter((p) => p.team_id === me).map((p) => p.player_id), opp: picks.filter((p) => p.team_id === opp).map((p) => p.player_id) } : undefined} />
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
                    {top(sid as number).map((p) => <span key={p.id}><span className="rh-who" data-pid={p.id}><Face p={p} size={24} /><span className="rh-ellip">{p.name}</span></span><b className={p.score != null && p.score >= 100 ? 'rh-up' : ''}>{p.score ?? <span className="rh-dim">{p.avg?.toFixed(0)}</span>}</b></span>)}
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

/* ---------------- prize strip ---------------- */

/** The game's prize, and once it's final, who won what. `standings` = club ids best first. */
export function PrizeStrip({ prize, clubs, standings, final, teamName, myTeamId }: { prize: Prize | null; clubs: number; standings: number[]; final: boolean; teamName: (id: number) => string; myTeamId: number }) {
  if (!prize?.on) return null;
  const pay = payouts(prize, clubs);
  const place = ['1st', '2nd', '3rd'];
  const last = standings[standings.length - 1];
  return (
    <section className={`rh-card rh-prizestrip ${final ? 'final' : ''}`}>
      <span className="rh-prizestrip-pool">🏆 {prize.entry ? <><b>${prize.entry * clubs}</b> <span className="rh-dim">pool · ${prize.entry} a club</span></> : <b>Prizes</b>}</span>
      <div className="rh-prizestrip-list">
        {pay.map((x, i) => (
          <span key={i} className={final && standings[i] === myTeamId ? 'me' : ''}>
            <em>{place[i]}</em> <b>${x}</b>{final && standings[i] != null && <> · {teamName(standings[i])}</>}
          </span>
        ))}
        {prize.extras.map((x, i) => <span key={`x${i}`}>{x}{final && /last|loser/i.test(x) && last != null && <> · <b>{teamName(last)}</b></>}</span>)}
      </div>
      {final && pay.length > 0 && standings[0] != null && <span className={`rh-prizestrip-win ${standings[0] === myTeamId ? 'me' : ''}`}>{standings[0] === myTeamId ? `You win $${pay[0]}` : `${teamName(standings[0])} wins $${pay[0]}`}</span>}
    </section>
  );
}

/* ---------------- player profile pop-up ---------------- */

const tone = (x: number) => (x >= 100 ? 'var(--rh-up)' : x >= 80 ? '#7fd88a' : x >= 60 ? '#c9b26b' : 'var(--rh-down)');
const money = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}m` : `$${Math.round(n / 1000)}k`);

function PlayerSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const [p, setP] = useState<LProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    setP(null); setErr(null);
    fetch(`/api/live/player?id=${id}`).then(async (r) => { const j = await r.json(); if (!stop) (r.ok ? setP(j) : setErr(j.error ?? 'Couldn’t load her profile')); })
      .catch(() => !stop && setErr('Couldn’t load her profile'));
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    const o = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { stop = true; window.removeEventListener('keydown', key); document.body.style.overflow = o; };
  }, [id, onClose]);
  const scale = Math.max(120, p?.hi ?? 0);
  const n = p?.log.length ?? 0;
  const share = (f: (x: number) => boolean) => (n ? Math.round((p!.log.filter((l) => f(l.score)).length / n) * 100) : 0);
  return (
    <div className="rh-sheet-back" role="dialog" aria-modal="true" aria-label="Player profile" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="rh-sheet">
        <button className="rh-sheet-x" onClick={onClose} aria-label="Close">×</button>
        {!p ? <div className="rh-dim" style={{ padding: 30, textAlign: 'center' }}>{err ?? 'Loading…'}</div> : (
          <>
            <div className="rh-sheet-head">
              <Face p={{ id: p.id, name: p.name, squad: p.squad }} size={64} />
              <div style={{ minWidth: 0 }}>
                <h2>{p.name}</h2>
                <div className="rh-dim" style={{ fontSize: 13 }}>
                  {p.club} · {p.pos.map((x) => <b key={x} style={{ color: SLOT_HUE[x as Slot] ?? 'inherit' }}>{x} </b>)}
                  {p.age != null && <>· {p.age}y </>}{p.firstSeason && <>· AFLW since {p.firstSeason}</>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {p.rank != null && <span className="rh-chip">#{p.rank} overall</span>}
                  {p.posRank && <span className="rh-chip">#{p.posRank.rank} of {p.posRank.of} {p.posRank.pos}</span>}
                  {p.status !== 'playing' && <span className="rh-chip" style={{ color: p.status === 'injured' || p.status === 'suspended' ? 'var(--rh-down)' : undefined }}>{p.injury ?? p.status.replace('-', ' ')}</span>}
                </div>
              </div>
            </div>
            <div className="rh-sheet-tiles">
              {([['Average', p.avg?.toFixed(1)], ['Last 3', p.l3?.toFixed(0)], ['Last 5', p.l5?.toFixed(0)], ['High', p.hi], ['Low', p.lo], ['Games', p.games]] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k}><span className="rh-k">{k}</span><b>{v ?? '–'}</b></div>
              ))}
            </div>
            {n > 0 && (
              <div>
                <div className="rh-k" style={{ marginBottom: 8 }}>Round by round</div>
                <div className="rh-sheet-bars" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}>
                  {p.log.map((l) => (
                    <div key={l.round} title={`Round ${l.round} ${l.home ? 'v' : '@'} ${l.opp}: ${l.score}`}>
                      <em>{l.score}</em>
                      <i style={{ height: `${Math.max(4, (l.score / scale) * 100)}%`, background: tone(l.score) }} />
                      <span>{l.opp}</span><small>R{l.round}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {n > 0 && (
              <div className="rh-sheet-range">
                <div><b style={{ color: 'var(--rh-up)' }}>{share((x) => x >= 100)}%</b><span>100+</span></div>
                <div><b style={{ color: '#7fd88a' }}>{share((x) => x >= 80 && x < 100)}%</b><span>80–99</span></div>
                <div><b style={{ color: '#c9b26b' }}>{share((x) => x >= 60 && x < 80)}%</b><span>60–79</span></div>
                <div><b style={{ color: 'var(--rh-down)' }}>{share((x) => x < 60)}%</b><span>under 60</span></div>
              </div>
            )}
            <div className="rh-sheet-foot rh-dim">
              <span>{money(p.price)}{p.seasonPriceChange ? <> ({p.seasonPriceChange > 0 ? '+' : '−'}{money(Math.abs(p.seasonPriceChange))} this year)</> : null}</span>
              {p.owned != null && <span>{p.owned.toFixed(0)}% owned in AFLW Fantasy</span>}
              {p.next && <span>Next: R{p.next.round} {p.next.home ? 'v' : '@'} {p.next.opp} · {new Date(p.next.date).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: PERTH })}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
