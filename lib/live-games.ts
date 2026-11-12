// Rules for the live mini games (snake drafts, salary cap, duels, custom games, prizes) and their scoring.
// Pure logic over the provider-neutral shapes in lib/scores — nothing here knows where the scores come from.
import type { LGame, LPlayer, LRound } from '@/lib/scores';

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
