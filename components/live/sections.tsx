'use client';
import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CAP_BUDGETS, GAME_KINDS, PRIZE_AMOUNTS, PRIZE_SPLITS, payouts, type Prize, picksPerTeam, lineupsFromPicks, onClock, type GamePick, type GameRow, type LGame, type LRound } from '@/lib/aflw';
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

const kindLabel = (g: Game) => g.kind === 'cap5' ? `salary cap $${g.budget ?? 350}k` : g.kind === 'duel5' ? 'one-match duel' : 'snake draft';
function statusOf(g: Game, teamName: (id: number) => string, myTeamId: number) {
  if (g.kind === 'cap5') return { live: true, text: 'Salary cap', sub: `${g.order.length} clubs · pick 5` };
  if (g.status === 'drafting') {
    const k = g.picks.length, t = onClock(g.order, k);
    return { live: true, text: t === myTeamId ? 'Your pick' : `Drafting · ${teamName(t)}`, sub: `Pick ${k + 1} of ${g.order.length * picksPerTeam(g.kind)}` };
  }
  return { live: false, text: 'Drafted', sub: `${g.order.length} clubs` };
}

/* ---------------- hub ---------------- */

export function Hub({ initial, games, ready, teams, myTeamId }: { initial: LRound; games: Game[]; ready: boolean; teams: TeamRow[]; myTeamId: number }) {
  const { data, byId, gameBySquad, liveNow } = useRound(initial);
  const teamName = useNames(teams);
  const mine = games.filter((g) => g.round === data.round && g.order.includes(myTeamId));
  const myTurn = mine.find((g) => g.kind !== 'cap5' && g.status === 'drafting' && onClock(g.order, g.picks.length) === myTeamId);
  const margins = mine.filter((g) => g.kind !== 'cap5' && g.status === 'done').map((g) => {
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
          <span className="rh-dim">Snake draft or salary cap, round or single match</span>
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
            <div className="rh-dim" style={{ fontSize: 12 }}>Round {g.round} · {kindLabel(g)} · {s.sub}</div>
          </div>
          <LiveChip live={s.live} text={s.text} />
        </div>
        <div className="rh-clubs">{g.order.map((t) => <span key={t} className={t === myTeamId ? 'me' : ''}>{teamName(t)}</span>)}</div>
        {g.prize?.on && <span className="rh-prizechip">🏆 {g.prize.entry ? `$${g.prize.entry * g.order.length} pool` : 'Prize'}{g.prize.extras.length ? ` · ${g.prize.extras[0]}` : ''}</span>}
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

export function NewGame({ rounds, current, games, teams, myTeamId }: { rounds: { n: number; name: string; status: string }[]; current: number; games: LGame[]; teams: TeamRow[]; myTeamId: number }) {
  const router = useRouter();
  const [kind, setKind] = useState('snake11');
  const [round, setRound] = useState(current);
  const [name, setName] = useState('');
  const [sel, setSel] = useState<number[]>([myTeamId]);
  const [budget, setBudget] = useState(350);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [prize, setPrize] = useState<Prize>({ on: false, entry: 10, split: 'wta', extras: [] });
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const k = GAME_KINDS.find((x) => x.kind === kind)!;
  const duel = kind === 'duel5', maxClubs = duel ? 2 : 10;
  const toggle = (id: number) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= maxClubs ? (duel ? [s[s.length - 1], id] : s) : [...s, id]);
  const pickKind = (v: string) => { setKind(v); if (v === 'duel5') { setSel((s) => s.slice(0, 2)); if (round !== current) setRound(current); } };
  return (
    <Shell title="New game" sub="Pick a format, the clubs, and go">
      <div className="rh-newgrid">
      <section className="rh-card rh-form">
        <label className="rh-field"><span className="rh-k">Game type</span>
          <select className="rh-select" value={kind} onChange={(e) => pickKind(e.target.value)}>
            {GAME_KINDS.map((g) => <option key={g.kind} value={g.kind} disabled={!g.ready}>{g.label}</option>)}
          </select>
          <span className="rh-dim" style={{ fontSize: 12.5 }}>{k.blurb}</span>
        </label>
        <div className="rh-form-2">
          <label className="rh-field"><span className="rh-k">Round</span>
            <select className="rh-select" value={round} onChange={(e) => setRound(Number(e.target.value))} disabled={duel}>
              {rounds.map((r) => <option key={r.n} value={r.n}>{r.name}{r.status === 'completed' ? ' · finished (practice)' : r.status === 'scheduled' ? '' : ' · live'}</option>)}
            </select>
          </label>
          <label className="rh-field"><span className="rh-k">Name</span>
            <input className="rh-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'cap5' ? `Round ${round} salary cap` : duel ? `Round ${round} duel` : `Round ${round} draft`} maxLength={60} />
          </label>
        </div>
        {kind === 'cap5' && (
          <div className="rh-form-2">
            <label className="rh-field"><span className="rh-k">Budget</span>
              <select className="rh-select" value={budget} onChange={(e) => setBudget(Number(e.target.value))}>
                {CAP_BUDGETS.map((b) => <option key={b} value={b}>${b}k{b === 300 ? ' · tight' : b === 400 ? ' · forgiving' : ''}</option>)}
              </select>
            </label>
            <label className="rh-field"><span className="rh-k">Games</span>
              <select className="rh-select" value={matchId ?? ''} onChange={(e) => setMatchId(e.target.value ? Number(e.target.value) : null)} disabled={round !== current}>
                <option value="">Whole round</option>
                {round === current && games.map((g) => <option key={g.id} value={g.id}>{g.home} v {g.away} · {new Date(g.date).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Perth' })}</option>)}
              </select>
            </label>
          </div>
        )}
        {duel && (
          <label className="rh-field"><span className="rh-k">Match</span>
            <select className="rh-select" value={matchId ?? ''} onChange={(e) => setMatchId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Pick a match…</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.home} v {g.away} · {new Date(g.date).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Perth' })}</option>)}
            </select>
            {games.length === 0 && <span className="rh-dim" style={{ fontSize: 12.5 }}>No matches in the current round.</span>}
          </label>
        )}
        <div className="rh-field"><span className="rh-k">Clubs · {sel.length} of {duel ? '2' : '2–10'}</span>
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
          <button className="rh-btn go lg" disabled={pending || sel.length < 2 || !k.ready || (duel && (sel.length !== 2 || !matchId))}
            onClick={() => start(async () => { const r = await createGame(duel ? current : round, kind, name, sel, { budget, matchId: round === current || duel ? matchId : null, prize }); if (r.ok && r.id) router.push(`/live/g/${r.id}`); else setErr(r.error ?? 'Couldn’t create the game.'); })}>
            {kind === 'cap5' ? 'Create game' : duel ? <>Randomise order &amp; start duel</> : <>Randomise order &amp; start draft</>}
          </button>
          <span className="rh-dim">{kind === 'cap5' ? `Everyone picks 5 under $${budget}k` : duel ? '10 picks · 5 each, 2+ from each side' : `${sel.length * picksPerTeam(kind)} picks · order drawn at random`}</span>
          {err && <span className="rh-down">{err}</span>}
        </div>
      </section>
      <PrizePanel prize={prize} setPrize={setPrize} clubs={sel.length} />
      </div>
    </Shell>
  );
}

const PRIZE_IDEAS = ['Last place buys the first round', 'Winner picks next week’s game', 'Loser wears the jersey of the winner’s choice', 'Bragging rights'];

/** Prizes & winnings: toggle on, set a cost per club (or none), how the pool is split, and any other prizes. */
function PrizePanel({ prize, setPrize, clubs }: { prize: Prize; setPrize: (p: Prize) => void; clubs: number }) {
  const set = (patch: Partial<Prize>) => setPrize({ ...prize, ...patch });
  const pool = prize.entry * clubs;
  const pay = payouts(prize, clubs);
  const custom = !PRIZE_AMOUNTS.includes(prize.entry) && prize.entry !== 0;
  return (
    <aside className={`rh-card rh-prize ${prize.on ? 'on' : ''}`}>
      <label className="rh-prize-head">
        <span><span className="rh-k">Prizes &amp; winnings</span><b>{prize.on ? 'Playing for something' : 'Just for bragging rights'}</b></span>
        <span className="rh-toggle"><input type="checkbox" checked={prize.on} onChange={(e) => set({ on: e.target.checked })} /><span /></span>
      </label>
      {prize.on && (
        <>
          <div className="rh-field">
            <span className="rh-k">Cost per club</span>
            <div className="rh-amounts">
              <button className={prize.entry === 0 ? 'on' : ''} onClick={() => set({ entry: 0 })}>None</button>
              {PRIZE_AMOUNTS.map((a) => <button key={a} className={prize.entry === a ? 'on' : ''} onClick={() => set({ entry: a })}>${a}</button>)}
              <label className={`rh-amount-custom ${custom ? 'on' : ''}`}>$<input inputMode="numeric" value={custom ? prize.entry : ''} placeholder="Other"
                onChange={(e) => set({ entry: Math.max(0, Math.min(1000, Number(e.target.value.replace(/\D/g, '')) || 0)) })} /></label>
            </div>
          </div>
          {prize.entry > 0 && (
            <>
              <div className="rh-potbox">
                <span className="rh-k">Prize pool</span>
                <b>${pool}</b>
                <span className="rh-dim">{clubs} club{clubs === 1 ? '' : 's'} × ${prize.entry}</span>
              </div>
              <div className="rh-field">
                <span className="rh-k">Payout</span>
                <div className="rh-seg">
                  {Object.entries(PRIZE_SPLITS).map(([k, v]) => <button key={k} className={prize.split === k ? 'on' : ''} disabled={v.pct.length >= Math.max(2, clubs)} onClick={() => set({ split: k })}>{v.label}</button>)}
                </div>
                <div className="rh-payouts">{pay.map((x, i) => <span key={i}><em>{['1st', '2nd', '3rd'][i]}</em><b>${x}</b></span>)}</div>
              </div>
            </>
          )}
          <div className="rh-field">
            <span className="rh-k">Other prizes</span>
            {prize.extras.map((x, i) => (
              <div key={i} className="rh-extra">
                <input className="rh-input" value={x} maxLength={80} onChange={(e) => set({ extras: prize.extras.map((y, j) => j === i ? e.target.value : y) })} placeholder="e.g. Loser shouts the pub" />
                <button className="cap-x" onClick={() => set({ extras: prize.extras.filter((_, j) => j !== i) })} aria-label="Remove prize">×</button>
              </div>
            ))}
            {prize.extras.length < 5 && (
              <div className="rh-amounts">
                <button onClick={() => set({ extras: [...prize.extras, ''] })}>+ Add a prize</button>
                {PRIZE_IDEAS.filter((x) => !prize.extras.includes(x)).slice(0, 3).map((x) => <button key={x} className="idea" onClick={() => set({ extras: [...prize.extras, x] })}>{x}</button>)}
              </div>
            )}
          </div>
          <span className="rh-dim" style={{ fontSize: 11.5 }}>The site keeps score of who’s owed what. Money is settled between you.</span>
        </>
      )}
    </aside>
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
        if (g.kind === 'cap5') return (
          <Link key={g.id} href={`/live/g/${g.id}`} className="rh-card rh-gcard">
            <b className="rh-gname">{g.name}</b><span className="rh-dim">Salary cap · ${g.budget ?? 350}k · {g.order.length} clubs. Tap for your 5 and the leaderboard.</span>
          </Link>
        );
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
            <HeadToHead gameId={g.id} me={myTeamId} opp={opp} lineups={l} byId={byId} gameBySquad={gameBySquad} teamName={teamName} myTeamId={myTeamId} liveNow={liveNow}
              flat={g.kind === 'duel5' ? { me: g.picks.filter((p) => p.team_id === myTeamId).map((p) => p.player_id), opp: g.picks.filter((p) => p.team_id === opp).map((p) => p.player_id) } : undefined} />
          </div>
        );
      })}
    </Shell>
  );
}
