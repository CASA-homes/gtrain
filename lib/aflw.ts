// Live AFL Fantasy scoring, straight from the official game's public data files (no login, no browser).
// AFLW for the 2026 test; the men's game uses the same shapes under /data/afl/ and can be switched on for 2027.
//   rounds.json                   fixture, game status, quarter and score (updated live)
//   players.json                  every player: position, average, scores by completed round
//   players_live_scores/{r}.json  [{id, score, locked}] for round r, updated during games
//   squads.json                   club names
const BASE = process.env.AFLW_FEED_BASE || 'https://fantasy.afl.com.au/json/aflw_fantasy/';   // override only for local testing
export const COMP = 'aflw2026';

type RawGame = { id: number; date: string; status: string; homeId: number; homeScore: number | null; awayId: number; awayScore: number | null; period: number | null; periodSeconds: number };
type RawRound = { id: number; roundNumber: number; name: string; status: string; startDate: string; endDate: string; games: RawGame[] };
type RawPlayer = { id: number; squadId: number; firstName: string; lastName: string; price: number; status: string; position: string[]; gamesPlayed: number; averagePoints: number | null; scores: Record<string, number> | null; highScore: number | null; last3Avg: number | null };
type RawSquad = { id: number; name: string; abbreviation: string };

export interface LPlayer { id: number; name: string; squad: string; squadId: number; pos: string[]; avg: number | null; l3: number | null; hi: number | null; games: number; status: string; score: number | null }
export interface LGame { id: number; date: string; status: string; home: string; away: string; homeId: number; awayId: number; homeScore: number | null; awayScore: number | null; period: number | null; periodSeconds: number }
export interface LRound { round: number; name: string; status: string; rounds: { n: number; name: string; status: string }[]; games: LGame[]; players: LPlayer[]; fetchedAt: string }

async function get<T>(path: string, revalidate: number): Promise<T> {
  const r = await fetch(BASE + path, { next: { revalidate } });
  if (!r.ok) throw new Error(`AFL Fantasy feed ${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

/** The round to show by default: the one being played, else the next scheduled, else the last. */
function currentRound(rounds: RawRound[]) {
  return rounds.find((r) => r.status !== 'completed' && r.status !== 'scheduled')
    ?? rounds.find((r) => r.status === 'scheduled')
    ?? rounds[rounds.length - 1];
}

export async function liveRound(round?: number): Promise<LRound> {
  const [rounds, squads, players] = await Promise.all([
    get<RawRound[]>('rounds.json', 20), get<RawSquad[]>('squads.json', 86400), get<RawPlayer[]>('players.json', 120),
  ]);
  const r = (round && rounds.find((x) => x.roundNumber === round)) || currentRound(rounds);
  const done = r.status === 'completed';
  let live: { id: number; score: number | null }[] = [];
  if (!done) { try { live = await get<{ id: number; score: number | null }[]>(`players_live_scores/${r.roundNumber}.json`, 15); } catch { live = []; } }
  const liveBy = new Map(live.map((x) => [x.id, x.score]));
  const sq = new Map(squads.map((s) => [s.id, s]));
  const playing = new Set(r.games.flatMap((g) => [g.homeId, g.awayId]));
  return {
    round: r.roundNumber, name: r.name, status: r.status,
    rounds: rounds.map((x) => ({ n: x.roundNumber, name: x.name, status: x.status })),
    games: r.games.map((g) => ({
      id: g.id, date: g.date, status: g.status, homeId: g.homeId, awayId: g.awayId,
      home: sq.get(g.homeId)?.abbreviation ?? String(g.homeId), away: sq.get(g.awayId)?.abbreviation ?? String(g.awayId),
      homeScore: g.homeScore, awayScore: g.awayScore, period: g.period, periodSeconds: g.periodSeconds,
    })),
    players: players.filter((p) => playing.has(p.squadId)).map((p) => ({
      id: p.id, name: `${p.firstName} ${p.lastName}`, squadId: p.squadId, squad: sq.get(p.squadId)?.abbreviation ?? '', pos: p.position,
      avg: p.averagePoints, l3: p.last3Avg ?? null, hi: p.highScore ?? null, games: p.gamesPlayed, status: p.status,
      score: done ? (p.scores?.[String(r.roundNumber)] ?? null) : (liveBy.get(p.id) ?? null),
    })),
    fetchedAt: new Date().toISOString(),
  };
}

export const SLOTS = { DEF: 3, MID: 4, RUC: 1, FWD: 3 } as const;
export type Slot = keyof typeof SLOTS;
export type Lineup = Partial<Record<Slot, number[]>>;

/** Snake draft: which club picks at pick number k (0-based) given the draft order. */
export function onClock(order: number[], k: number) {
  const n = order.length, r = Math.floor(k / n), i = k % n;
  return r % 2 === 0 ? order[i] : order[n - 1 - i];
}
export const PICKS_PER_TEAM = 11;
export interface GamePick { pick_no: number; team_id: number; player_id: number; player_name: string; slot: Slot; picked_at: string }
export interface GameRow { id: number; round: number; kind: string; name: string; status: 'drafting' | 'done'; order: number[]; created_by: string; created_at: string; finished_at: string | null }
/** Which slot a player takes for a club: the first of his positions that still has room. */
export function slotFor(pos: string[], picks: { slot: Slot }[]): Slot | null {
  for (const s of pos) if (s in SLOTS && picks.filter((p) => p.slot === s).length < SLOTS[s as Slot]) return s as Slot;
  return null;
}
export function lineupsFromPicks(picks: GamePick[]): Record<number, Lineup> {
  const out: Record<number, Lineup> = {};
  for (const p of [...picks].sort((a, b) => a.pick_no - b.pick_no)) ((out[p.team_id] ??= {})[p.slot] ??= []).push(p.player_id);
  return out;
}
/** Game types for the New Game menu. Only the snake draft is built; the rest are placeholders. */
export const GAME_KINDS = [
  { kind: 'snake11', label: 'Snake draft · 11-a-side', blurb: '2–10 clubs draft 3 DEF, 4 MID, 1 RUC, 3 FWD for the round. Highest score wins.', ready: true },
  { kind: 'tbd1', label: 'Salary cap (coming soon)', blurb: 'TBD', ready: false },
  { kind: 'tbd2', label: 'Season-long league (coming soon)', blurb: 'TBD', ready: false },
  { kind: 'tbd3', label: 'Captain’s pick (coming soon)', blurb: 'TBD', ready: false },
];
