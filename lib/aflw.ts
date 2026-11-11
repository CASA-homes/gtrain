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
export interface LRound { round: number; name: string; status: string; rounds: { n: number; name: string; status: string }[]; games: LGame[]; players: LPlayer[]; fetchedAt: string;
  /** Top scorer of the last completed round before this one: he gets the score plate in this round's matchups. */
  top?: { id: number; name: string; squad: string; score: number; round: number } | null }

async function get<T>(path: string, revalidate: number): Promise<T> {
  const r = await fetch(BASE + path, { next: { revalidate } });
  if (!r.ok) throw new Error(`AFL Fantasy feed ${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

/** Just the round list and each round's status (one small file), for code that only needs to know which rounds are finished. */
export async function aflwRounds(): Promise<{ n: number; status: string }[]> {
  const rounds = await get<RawRound[]>('rounds.json', 300);
  return rounds.map((x) => ({ n: x.roundNumber, status: x.status }));
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
  const prev = [...rounds].filter((x) => x.status === 'completed' && x.roundNumber < r.roundNumber).pop();
  let top: LRound['top'] = null;
  if (prev) for (const p of players) {
    const s = p.scores?.[String(prev.roundNumber)];
    if (s != null && (!top || s > top.score)) top = { id: p.id, name: `${p.firstName} ${p.lastName}`, squad: sq.get(p.squadId)?.abbreviation ?? '', score: s, round: prev.roundNumber };
  }
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
    top,
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
/** Picks each club makes: 11 in the snake draft, 5 in a one-match duel. */
export const picksPerTeam = (kind: string, settings?: GameSettings | null) => (kind === 'duel5' ? 5 : kind === 'custom' && settings ? settings.per : PICKS_PER_TEAM);

/* ---------- custom games (battle desk) ---------- */
/** Settings for a custom game. 'total' = highest team score wins; 'duels' = one player per AFL match, higher scorer wins the point. */
export interface GameSettings {
  mode: 'total' | 'duels';
  per: number;                       // players per club
  formation: Record<Slot, number>;   // total mode only
  matches: number[];                 // AFL match ids in play (empty = the whole round)
  captain: boolean; vc: boolean; triple: boolean;
}
export const FORMATIONS: { label: string; f: Record<Slot, number> }[] = [
  { label: '3 a side · 1-1-0-1', f: { DEF: 1, MID: 1, RUC: 0, FWD: 1 } },
  { label: '5 a side · 1-2-1-1', f: { DEF: 1, MID: 2, RUC: 1, FWD: 1 } },
  { label: '6 a side · 2-2-0-2', f: { DEF: 2, MID: 2, RUC: 0, FWD: 2 } },
  { label: '8 a side · 2-3-1-2', f: { DEF: 2, MID: 3, RUC: 1, FWD: 2 } },
  { label: '11 a side · 3-4-1-3', f: { DEF: 3, MID: 4, RUC: 1, FWD: 3 } },
];
export const DEFAULT_SETTINGS: GameSettings = { mode: 'total', per: 5, formation: { DEF: 1, MID: 2, RUC: 1, FWD: 1 }, matches: [], captain: true, vc: false, triple: false };
/** Tidy settings from a form: valid formation, players per club, and duels = one per match. */
export function cleanSettings(x: Partial<GameSettings> | null | undefined, roundMatchIds: number[]): GameSettings {
  const f = { DEF: 0, MID: 0, RUC: 0, FWD: 0 } as Record<Slot, number>;
  for (const k of Object.keys(f) as Slot[]) f[k] = Math.max(0, Math.min(6, Math.round(Number(x?.formation?.[k]) || 0)));
  const matches = [...new Set((x?.matches ?? []).map(Number))].filter((m) => roundMatchIds.includes(m));
  const mode = x?.mode === 'duels' ? 'duels' : 'total';
  const per = mode === 'duels' ? (matches.length || roundMatchIds.length) : Object.values(f).reduce((a, b) => a + b, 0);
  return { mode, per: Math.max(1, Math.min(11, per)), formation: f, matches, captain: !!x?.captain && mode === 'total', vc: !!x?.vc && !!x?.captain && mode === 'total', triple: !!x?.triple && !!x?.captain && mode === 'total' };
}
/** Slot limits for a game's lineup (null = positions don't matter). */
export function slotLimits(kind: string, settings?: GameSettings | null): Record<Slot, number> | null {
  if (kind === 'snake11') return { ...SLOTS };
  if (kind === 'custom' && settings?.mode === 'total') return settings.formation;
  return null;
}
/** The AFL matches in play for a custom game. */
export const matchesInPlay = (s: GameSettings, games: LGame[]) => (s.matches.length ? games.filter((g) => s.matches.includes(g.id)) : games);
/** Can this club take this player in a custom game? */
export function customFits(p: { squadId: number; pos: string[] }, teamPicks: { slot: Slot; player_id: number }[], s: GameSettings, games: LGame[], squadOf: (playerId: number) => number): boolean {
  const inPlay = matchesInPlay(s, games);
  const match = inPlay.find((g) => g.homeId === p.squadId || g.awayId === p.squadId);
  if (!match) return false;
  if (teamPicks.length >= s.per) return false;
  if (s.mode === 'duels') return !teamPicks.some((pk) => { const sq = squadOf(pk.player_id); return sq === match.homeId || sq === match.awayId; });
  return slotFor(p.pos, teamPicks, s.formation) != null;
}
/** One-match duel: each club needs at least this many players from each side of the match. */
export const DUEL_MIN_SIDE = 2;
/** Can this club still take a player from squad `squadId` and finish with 2+ from each side? */
export function duelFits(squadId: number, teamSquads: number[], match: { homeId: number; awayId: number } | null | undefined): boolean {
  if (!match || (squadId !== match.homeId && squadId !== match.awayId)) return false;
  const after = [...teamSquads, squadId];
  const left = 5 - after.length;
  if (left < 0) return false;
  const need = Math.max(0, DUEL_MIN_SIDE - after.filter((x) => x === match.homeId).length) + Math.max(0, DUEL_MIN_SIDE - after.filter((x) => x === match.awayId).length);
  return need <= left;
}
export interface GamePick { pick_no: number; team_id: number; player_id: number; player_name: string; slot: Slot; picked_at: string }
export interface GameRow { id: number; round: number; kind: string; name: string; status: 'drafting' | 'done'; order: number[]; created_by: string; created_at: string; finished_at: string | null; budget: number | null; match_id: number | null; prize: Prize | null; settings?: GameSettings | null }
/** Which slot a player takes for a club: the first of his positions that still has room. */
export function slotFor(pos: string[], picks: { slot: Slot }[], limits: Record<Slot, number> = SLOTS): Slot | null {
  for (const s of pos) if (s in limits && picks.filter((p) => p.slot === s).length < limits[s as Slot]) return s as Slot;
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
  { kind: 'cap5', label: 'Salary cap · pick 5', blurb: 'Any 5 players under a budget, priced off their average. Captain scores double. Players lock at their first bounce.', ready: true },
  { kind: 'duel5', label: 'One-match duel · 5 v 5', blurb: 'Two clubs, one match. Snake draft 5 players each from the two sides, at least 2 from each side. Highest score wins.', ready: true },
  { kind: 'custom', label: 'Custom game', blurb: 'Build your own: players per club, formation, which matches, captains, total score or 1-v-1 player duels.', ready: true },
  { kind: 'tbd2', label: 'Season-long league (coming soon)', blurb: 'TBD', ready: false },
  { kind: 'tbd3', label: 'Captain’s pick (coming soon)', blurb: 'TBD', ready: false },
];

/* ---------- Salary Cap 5 ---------- */
export const CAP_PICKS = 5;
export const CAP_BUDGETS = [300, 350, 400];
/** Price in $k: the season average, rounded (a 100-average player costs $100k), with a $15k floor. */
export function priceOf(p: { avg: number | null; l3?: number | null }) { return Math.max(15, Math.round(p.avg ?? p.l3 ?? 25)); }
export interface CapEntry { team_id: number; players: number[]; hidden: number; captain: number | null; cost: number | null; updated_at: string }
/** A player's game has started (or finished) — they're locked. */
export function lockedIds(round: LRound): Set<number> {
  const started = new Set(round.games.filter((g) => g.status !== 'scheduled').flatMap((g) => [g.homeId, g.awayId]));
  return new Set(round.players.filter((p) => started.has(p.squadId)).map((p) => p.id));
}
export function capScore(e: { players: number[]; captain: number | null }, byId: Map<number, LPlayer>) {
  let score = 0, proj = 0, left = 0;
  for (const id of e.players) {
    const p = byId.get(id); if (!p) continue;
    const mult = id === e.captain ? 2 : 1;
    score += (p.score ?? 0) * mult;
    if (p.score == null) { proj += (p.avg ?? 0) * mult; left++; } else proj += p.score * mult;
  }
  return { score, proj: Math.round(proj), left };
}

/* ---------- prizes ---------- */
export const PRIZE_SPLITS: Record<string, { label: string; pct: number[] }> = {
  wta: { label: 'Winner takes all', pct: [100] },
  '70-30': { label: '70 / 30', pct: [70, 30] },
  '60-30-10': { label: '60 / 30 / 10', pct: [60, 30, 10] },
};
export const PRIZE_AMOUNTS = [5, 10, 20, 50];
export interface Prize { on: boolean; entry: number; split: string; extras: string[] }
/** Cash for each place: the pool split by percentage, rounded to the dollar (any rounding remainder goes to 1st). */
export function payouts(p: Prize | null | undefined, clubs: number): number[] {
  if (!p?.on || !p.entry) return [];
  const pool = p.entry * clubs;
  const pct = (PRIZE_SPLITS[p.split] ?? PRIZE_SPLITS.wta).pct.slice(0, Math.max(1, clubs - 1));
  const tot = pct.reduce((a, b) => a + b, 0);
  const out = pct.map((x) => Math.floor((pool * x) / tot));
  out[0] += pool - out.reduce((a, b) => a + b, 0);
  return out;
}

/* ---------------- player profile (pop-up in the live game) ---------------- */

export interface LProfile {
  id: number; name: string; squad: string; club: string; pos: string[]; age: number | null; firstSeason: number | null; seasons: number;
  status: string; injury: string | null; price: number; seasonPriceChange: number; owned: number | null;
  games: number; avg: number | null; l3: number | null; l5: number | null; hi: number | null; lo: number | null; total: number;
  rank: number | null; posRank: { pos: string; rank: number; of: number } | null;
  log: { round: number; score: number; opp: string; home: boolean }[];
  next: { round: number; opp: string; home: boolean; date: string; status: string } | null;
}

export async function aflwProfile(id: number): Promise<LProfile | null> {
  type FullPlayer = RawPlayer & { dob?: string; totalPoints?: number; last5Avg?: number | null; lowScore?: number | null; seasonRank?: number | null;
    ownership?: Record<string, number> | null; seasonPriceChange?: number; seasons?: number[]; injuryMeta?: unknown };
  const [rounds, squads, players] = await Promise.all([
    get<RawRound[]>('rounds.json', 60), get<RawSquad[]>('squads.json', 86400), get<FullPlayer[]>('players.json', 120),
  ]);
  const p = players.find((x) => x.id === id);
  if (!p) return null;
  const sq = new Map(squads.map((s) => [s.id, s]));
  const abbr = (sid: number) => sq.get(sid)?.abbreviation ?? String(sid);
  const gameOf = (r: RawRound) => r.games.find((g) => g.homeId === p.squadId || g.awayId === p.squadId);
  const log = Object.entries(p.scores ?? {}).map(([rn, score]) => {
    const g = gameOf(rounds.find((r) => r.roundNumber === Number(rn)) ?? ({ games: [] } as unknown as RawRound));
    const home = g?.homeId === p.squadId;
    return { round: Number(rn), score, opp: g ? abbr(home ? g.awayId : g.homeId) : '', home };
  }).sort((a, b) => a.round - b.round);
  const nr = currentRound(rounds), ng = nr && gameOf(nr);
  const dob = p.dob ? new Date(p.dob) : null;
  const age = dob ? Math.floor((Date.now() - dob.getTime()) / 31_557_600_000) : null;
  const years = [...new Set((p.seasons ?? []).map((s) => Math.floor(s / 10)))].sort();
  const own = p.ownership ? Object.entries(p.ownership).sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1] ?? null : null;
  // Position rank: by average among players at that position with 3+ games.
  const mainPos = p.position[0];
  const peers = players.filter((x) => x.position.includes(mainPos) && x.gamesPlayed >= 3 && x.averagePoints != null).sort((a, b) => (b.averagePoints ?? 0) - (a.averagePoints ?? 0));
  const pr = peers.findIndex((x) => x.id === p.id);
  const inj = p.injuryMeta as { description?: string; weeks?: number } | null | undefined;
  return {
    id: p.id, name: `${p.firstName} ${p.lastName}`, squad: abbr(p.squadId), club: sq.get(p.squadId)?.name ?? '', pos: p.position, age,
    firstSeason: years[0] ?? null, seasons: years.length,
    status: p.status, injury: inj ? [inj.description || 'Injured', inj.weeks ? `${inj.weeks} week${inj.weeks > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : null,
    price: p.price, seasonPriceChange: p.seasonPriceChange ?? 0, owned: own,
    games: p.gamesPlayed, avg: p.averagePoints, l3: p.last3Avg ?? null, l5: p.last5Avg ?? null, hi: p.highScore ?? null, lo: p.lowScore ?? null, total: p.totalPoints ?? 0,
    rank: p.seasonRank ?? null, posRank: pr >= 0 ? { pos: mainPos, rank: pr + 1, of: peers.length } : null,
    log,
    next: nr && ng && !log.some((l) => l.round === nr.roundNumber)
      ? { round: nr.roundNumber, opp: abbr(ng.homeId === p.squadId ? ng.awayId : ng.homeId), home: ng.homeId === p.squadId, date: ng.date, status: ng.status }
      : null,
  };
}

/* ---------- custom game scoring ---------- */
export interface Roles { captain: number | null; vc: number | null }
export interface CustomResult { team: number; score: number; proj: number; points: number; left: number }
const done = (g?: LGame) => g?.status === 'completed';
/** Team scores for a custom game. Total mode: sum with captain x2 (x3 triple); the VC takes the multiplier if the captain
 *  plays no part. Duels mode: each AFL match is a duel between the clubs' players in it; the higher score wins 1 point (0.5 each if level). */
export function customResults(s: GameSettings, order: number[], picks: GamePick[], roles: Record<number, Roles>, byId: Map<number, LPlayer>, gameBySquad: Map<number, LGame>, games: LGame[]): CustomResult[] {
  const mult = s.triple ? 3 : 2;
  const val = (id: number) => { const p = byId.get(id); return { sc: p?.score ?? null, proj: p ? (p.score ?? p.avg ?? 0) : 0, g: p ? gameBySquad.get(p.squadId) : undefined }; };
  const out = order.map((team) => {
    const mine = picks.filter((p) => p.team_id === team);
    const r = roles[team] ?? { captain: null, vc: null };
    const cap = r.captain != null ? val(r.captain) : null;
    const capOut = cap != null && done(cap.g) && (cap.sc ?? 0) === 0;
    let score = 0, proj = 0, left = 0;
    for (const pk of mine) {
      const v = val(pk.player_id);
      let m = 1;
      if (s.captain && pk.player_id === r.captain) m = mult;
      if (s.captain && s.vc && capOut && pk.player_id === r.vc) m = mult;
      score += (v.sc ?? 0) * m; proj += v.proj * m; if (!done(v.g)) left++;
    }
    return { team, score, proj: Math.round(proj), points: 0, left };
  });
  if (s.mode === 'duels' && order.length === 2) {
    const squadOf = (id: number) => byId.get(id)?.squadId ?? 0;
    for (const g of matchesInPlay(s, games)) {
      const [a, b] = order.map((t) => picks.find((pk) => pk.team_id === t && [g.homeId, g.awayId].includes(squadOf(pk.player_id))));
      if (!a || !b || g.status === 'scheduled') continue;
      const sa = byId.get(a.player_id)?.score ?? 0, sb = byId.get(b.player_id)?.score ?? 0;
      if (g.status !== 'completed') continue;
      if (sa > sb) out[0].points += 1; else if (sb > sa) out[1].points += 1; else { out[0].points += 0.5; out[1].points += 0.5; }
    }
  }
  return out;
}
