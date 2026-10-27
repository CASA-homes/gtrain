'use client';
import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GAME_KINDS, PICKS_PER_TEAM, lineupsFromPicks, onClock, type GamePick, type GameRow, type LRound } from '@/lib/aflw';
import { createGame } from '@/app/(app)/live/actions';
import { Empty, HeadToHead, LiveChip, Shell, gameLabel, isLive, totals, useRound, type TeamRow } from './kit';

type Game = GameRow & { picks: GamePick[] };
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);
const useNames = (teams: TeamRow[]) => useCallback((id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`, [teams]);

/** The opponent to show for me in a game: the other club in a 2-club game, else the best of the rest. */
function rival(g: Game, me: number, scoreOf: (t: number) => number) {
  const others = g.order.filter((t) => t !== me);
  return others.sort((a, b) => scoreOf(b) - scoreOf(a))[0];
}

function statusOf(g: Game, teamName: (id: number) => string, myTeamId: number) {
  if (g.status === 'drafting') {
    const k = g.picks.length, t = onClock(g.order, k);
    return { live: true, text: t === myTeamId ? 'Your pick' : `Drafting · ${teamName(t)}`, sub: `Pick ${k + 1} of ${g.order.length * PICKS_PER_TEAM}` };
  }
  return { live: false, text: 'Drafted', sub: `${g.order.length} clubs` };
}

/* ---------------- hub ---------------- */

export function Hub({ initial, games, ready, teams, myTeamId }: { initial: LRound; games: Game[]; ready: boolean; teams: TeamRow[]; myTeamId: number }) {
  const { data, byId, gameBySquad, liveNow } = useRound(initial);
  const teamName = useNames(teams);
  const mine = games.filter((g) => g.round === data.round && g.order.includes(myTeamId));
  const myTurn = mine.find((g) => g.status === 'drafting' && onClock(g.order, g.picks.length) === myTeamId);
  const margins = mine.filter((g) => g.status === 'done').map((g) => {
    const l = lineupsFromPicks(g.picks);
    const sc = (t: number) => totals(l[t], byId, gameBySquad);
    const opp = rival(g, myTeamId, (t) => sc(t).score);
    const a = sc(myTeamId), b = sc(opp);
    return a.score + b.score > 0 ? a.score - b.score : a.proj - b.proj;
  });
  const best = margins.length ? Math.max(...margins) : null;
  const liveGames = data.games.filter(isLive).length;
  const next = data.games.filter((g) => g.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0];
  return (
    <Shell title="Live Matchups" sub={<>{data.name} · AFLW Fantasy</>} right={<LiveChip live={liveNow} text={liveNow ? `${liveGames} live` : data.status === 'completed' ? 'Round over' : 'Pre-game'} />}>
      {!ready && <Empty>Run supabase/migrations/0010_mini_draft.sql in the Supabase SQL editor to switch games on.</Empty>}
      {myTurn && <Link href={`/live/g/${myTurn.id}`} className="rh-alert">You’re on the clock in <b>{myTurn.name}</b> <span>Pick now →</span></Link>}
      <div className="rh-hub">
        <Link href="/live/games" className="rh-tile">
          <span className="rh-k">Current games</span>
          <b className="rh-tile-big">{mine.length}</b>
          <span className="rh-dim">{mine.length ? mine.map((g) => g.name).slice(0, 2).join(' · ') : 'Nothing this weekend yet'}</span>
        </Link>
        <Link href="/live/new" className="rh-tile">
          <span className="rh-k">New game</span>
          <b className="rh-tile-big">+</b>
          <span className="rh-dim">Snake draft 2–10 clubs for the round</span>
        </Link>
        <Link href="/live/matchups" className="rh-tile">
          <span className="rh-k">Matchups</span>
          <b className={`rh-tile-big ${best == null ? '' : best >= 0 ? 'rh-up' : 'rh-down'}`}>{best == null ? '—' : signed(best)}</b>
          <span className="rh-dim">{best == null ? 'Your live margins land here' : `Best margin across ${margins.length} game${margins.length === 1 ? '' : 's'}`}</span>
        </Link>
        <Link href="/live/scores" className="rh-tile">
          <span className="rh-k">Live scores</span>
          <b className="rh-tile-big">{liveGames || data.games.length}</b>
          <span className="rh-dim">{liveGames ? 'games live now' : next ? `games · next ${gameLabel(next)}` : 'games this round'}</span>
        </Link>
      </div>
    </Shell>
  );
}

/* ---------------- current games ---------------- */

export function GamesList({ round, roundName, games, ready, teams, myTeamId }: { round: number; roundName: string; games: Game[]; ready: boolean; teams: TeamRow[]; myTeamId: number }) {
  const teamName = useNames(teams);
  const mineNow = games.filter((g) => g.round === round && g.order.includes(myTeamId));
  const othersNow = games.filter((g) => g.round === round && !g.order.includes(myTeamId));
  const earlier = games.filter((g) => g.round !== round && g.order.includes(myTeamId));
  const card = (g: Game) => {
    const s = statusOf(g, teamName, myTeamId);
    return (
      <Link key={g.id} href={`/live/g/${g.id}`} className="rh-card rh-gcard">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <b className="rh-gname">{g.name}</b>
            <div className="rh-dim" style={{ fontSize: 12 }}>Round {g.round} · snake draft · {s.sub}</div>
          </div>
          <LiveChip live={s.live} text={s.text} />
        </div>
        <div className="rh-clubs">{g.order.map((t) => <span key={t} className={t === myTeamId ? 'me' : ''}>{teamName(t)}</span>)}</div>
      </Link>
    );
  };
  return (
    <Shell title="Current games" sub={<>{roundName} and the season</>} right={<Link href="/live/new" className="rh-btn go">New game</Link>}>
      {!ready && <Empty>Run supabase/migrations/0010_mini_draft.sql in the Supabase SQL editor to switch games on.</Empty>}
      <h2 className="rh-h2">This weekend</h2>
      {mineNow.length ? <div className="rh-glist">{mineNow.map(card)}</div> : <Empty>You’re not in a game this weekend. <Link href="/live/new" className="rh-link">Start one</Link>.</Empty>}
      <h2 className="rh-h2">Season</h2>
      <Empty>Season-long games are coming. They’ll sit here alongside your weekend games.</Empty>
      {othersNow.length > 0 && <><h2 className="rh-h2">Other games this weekend</h2><div className="rh-glist">{othersNow.map(card)}</div></>}
      {earlier.length > 0 && <><h2 className="rh-h2">Earlier rounds</h2><div className="rh-glist">{earlier.map(card)}</div></>}
    </Shell>
  );
}

/* ---------------- new game ---------------- */

export function NewGame({ rounds, current, teams, myTeamId }: { rounds: { n: number; name: string; status: string }[]; current: number; teams: TeamRow[]; myTeamId: number }) {
  const router = useRouter();
  const [kind, setKind] = useState('snake11');
  const [round, setRound] = useState(current);
  const [name, setName] = useState('');
  const [sel, setSel] = useState<number[]>([myTeamId]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const k = GAME_KINDS.find((x) => x.kind === kind)!;
  const toggle = (id: number) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 10 ? s : [...s, id]);
  return (
    <Shell title="New game" sub="Pick a format, the clubs, and go">
      <section className="rh-card rh-form">
        <label className="rh-field"><span className="rh-k">Game type</span>
          <select className="rh-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            {GAME_KINDS.map((g) => <option key={g.kind} value={g.kind} disabled={!g.ready}>{g.label}</option>)}
          </select>
          <span className="rh-dim" style={{ fontSize: 12.5 }}>{k.blurb}</span>
        </label>
        <div className="rh-form-2">
          <label className="rh-field"><span className="rh-k">Round</span>
            <select className="rh-select" value={round} onChange={(e) => setRound(Number(e.target.value))}>
              {rounds.map((r) => <option key={r.n} value={r.n}>{r.name}{r.status === 'completed' ? ' · finished (practice)' : r.status === 'scheduled' ? '' : ' · live'}</option>)}
            </select>
          </label>
          <label className="rh-field"><span className="rh-k">Name</span>
            <input className="rh-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Round ${round} draft`} maxLength={60} />
          </label>
        </div>
        <div className="rh-field"><span className="rh-k">Clubs · {sel.length} of 2–10</span>
          <div className="rh-pickclubs">
            {teams.map((t) => {
              const on = sel.includes(t.id);
              return (
                <button key={t.id} className={on ? 'on' : ''} onClick={() => toggle(t.id)} aria-pressed={on}>
                  <span>{t.name}{t.id === myTeamId && <em>you</em>}</span><i>{on ? '✓' : '+'}</i>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="rh-btn go lg" disabled={pending || sel.length < 2 || !k.ready}
            onClick={() => start(async () => { const r = await createGame(round, kind, name, sel); if (r.ok && r.id) router.push(`/live/g/${r.id}`); else setErr(r.error ?? 'Couldn’t create the game.'); })}>
            Randomise order &amp; start draft
          </button>
          <span className="rh-dim">{sel.length * PICKS_PER_TEAM} picks · order drawn at random</span>
          {err && <span className="rh-down">{err}</span>}
        </div>
      </section>
    </Shell>
  );
}

/* ---------------- my matchups ---------------- */

export function MyMatchups({ initial, games, teams, myTeamId }: { initial: LRound; games: Game[]; teams: TeamRow[]; myTeamId: number }) {
  const { data, byId, gameBySquad, liveNow } = useRound(initial);
  const teamName = useNames(teams);
  const mine = useMemo(() => games.filter((g) => g.round === data.round && g.order.includes(myTeamId)), [games, data.round, myTeamId]);
  return (
    <Shell title="Matchups" sub={<>{data.name} · you v your opponent in each game</>} right={<LiveChip live={liveNow} text={liveNow ? 'Live' : data.status === 'completed' ? 'Final' : 'Pre-game'} />}>
      {mine.length === 0 && <Empty>No games this weekend. <Link href="/live/new" className="rh-link">Start one</Link>.</Empty>}
      {mine.map((g) => {
        if (g.status === 'drafting') return (
          <Link key={g.id} href={`/live/g/${g.id}`} className="rh-card rh-gcard">
            <b className="rh-gname">{g.name}</b><span className="rh-dim">Still drafting. Tap to join the draft room.</span>
          </Link>
        );
        const l = lineupsFromPicks(g.picks);
        const opp = rival(g, myTeamId, (t) => totals(l[t], byId, gameBySquad).score);
        return (
          <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href={`/live/g/${g.id}`} className="rh-gtitle">{g.name}{g.order.length > 2 && <span className="rh-dim"> · v the best of {g.order.length - 1} rivals</span>} →</Link>
            <HeadToHead gameId={g.id} me={myTeamId} opp={opp} lineups={l} byId={byId} gameBySquad={gameBySquad} teamName={teamName} myTeamId={myTeamId} liveNow={liveNow} />
          </div>
        );
      })}
    </Shell>
  );
}
