// 2027 outlook and future build.
//
// 2027 projection:
//   1. Each player's 2027 average = 2026 average (small samples pulled toward 55) × age curve + hand-noted adjustments.
//      Retired, delisted and long-term injured players project to zero.
//   2. Each team keeps 17 + a rookie. Teams that have set keepers use them; everyone else keeps their best 18 projected.
//   3. Everyone else goes back in the pool and the 2027 draft is simulated in real pick order; each pick takes the
//      player who adds most to that team's starting 18 (positional need), not just the best average left.
//   4. Teams are ranked on a position-valid starting 18 (5 DEF / 7 MID / 1 RUC / 5 FWD) from that projected list.
//
// Future build: each player's score blends projected scoring with potential stars, weighted by how many prime
// years he has left. A team's score is its best 18 future scores.
import { age, LINE_SLOTS, type Line, type PlayerRow } from '@/lib/ratings';
import { noteFor } from '@/lib/notes';
import { bounceBack } from '@/lib/injury';

const SEASON_START_2027 = new Date(2027, 2, 1);
export { AGE_CURVE, curve } from '@/lib/ratings';
import { curve } from '@/lib/ratings';

export function projected2027(p: PlayerRow): number {
  if (p.list_status) return 0;
  const g = p.games ?? 0;
  const avg = p.average ?? 0;
  // Injured players project off a blend of their recent peak and 2026, not the injury-hit 2026 number alone.
  const bb = bounceBack(p);
  const base = bb ? Math.max(avg, bb.blended) : g < 10 ? (avg * g + 55 * 4) / (g + 4) : avg;
  const a = age(p.birth_date, SEASON_START_2027) ?? 26;
  const delta = noteFor(p.name, p.afl_club)?.delta ?? 0;
  return Math.max(0, Math.round((base * curve(a) + delta) * 10) / 10);
}

/** Future build only counts kept players this age or younger (current age)... */
export const FUTURE_MAX_AGE = 23;
/** ...and ranks each team on its best this-many of them, so quality beats quantity. */
export const FUTURE_CORE = 6;
/** A team's best two 2027 picks count as incoming prospects in its future build. */
export const FUTURE_PICKS = 2;
/** Future score of the prospect a 2027 pick brings in: pick 1 ≈ 115, falling ~4.5% a pick (pick 10 ≈ 77, pick 20 ≈ 49). */
export const prospectScore = (overall: number) => Math.round(115 * Math.exp(-0.045 * (overall - 1)));

/**
 * Future-build score for one player: his projected peak, weighted by how many prime years he has left.
 *   peak = projected 2027 average, grown part of the way along the age curve to 26. Potential sets how much of
 *          that growth he gets, and only 60% of it counts, so kids already scoring rate ahead of raw ones.
 *   years left = prime seasons until 31; a 19-year-old has twelve, a 28-year-old three.
 * The scarce-line bonus (forwards, defenders) only counts in full for players good enough to start there.
 */
/** Commish calls, applied in order: Ram Dawgs (pick 1, Holmes, Reid, O'Sullivan, Freijah, top-two lines) sit 3rd;
 *  NSW-ACT sits behind Pato's and Ram Dawgs; Bodega's kids are good, but with no top-10 pick they sit 5th. */
export const FUTURE_PIN: Record<string, number> = {};

/** Commish calls on the future build, as a multiplier on a player's future score. */
const FUTURE_ADJUST: Record<string, number> = { 'L. Humphries': 1.4, 'H. Thomas': 0.6 };

export function futureScore(p: PlayerRow, potentialStars: number | null, lineBonus = 0, lineEdge = 0): number {
  return Math.round(rawFutureScore(p, potentialStars, lineBonus, lineEdge) * (FUTURE_ADJUST[p.name] ?? 1));
}

function rawFutureScore(p: PlayerRow, potentialStars: number | null, lineBonus = 0, lineEdge = 0): number {
  if (p.list_status) return 0;
  const a = age(p.birth_date, SEASON_START_2027) ?? 27;
  const bonus = lineBonus * Math.max(0, Math.min(1, (lineEdge + 5) / 10));
  const base = projected2027(p) + bonus;
  let cum = 1;
  for (let y = a + 1; y <= 26; y++) cum *= curve(y);
  const peak = base * (1 + (cum - 1) * ((potentialStars ?? 2.5) / 5) * 0.6);
  const years = Math.max(0, 31 - a);
  return Math.round(peak * Math.max(0.45, Math.min(1.12, 0.6 + years * 0.045)));
}

/** The ruck counts for half: one player shouldn't swing a team as much as a whole line. */
export const LINE_WEIGHT: Record<Line, number> = { DEF: 1, MID: 1, RUC: 0.5, FWD: 1 };

/** Position-valid starting 18 (1 RUC, 5 DEF, 5 FWD, 7 MID, scarce lines first). Returns per-line totals. */
export function lineTotals(players: { id: number; positions: Line[]; score: number }[]): Record<Line, number> {
  const sorted = [...players].sort((x, y) => y.score - x.score);
  const used = new Set<number>();
  const out = { DEF: 0, MID: 0, RUC: 0, FWD: 0 } as Record<Line, number>;
  for (const line of ['RUC', 'DEF', 'FWD', 'MID'] as Line[]) {
    let n = 0;
    for (const p of sorted) {
      if (n >= LINE_SLOTS[line]) break;
      if (used.has(p.id) || !p.positions.includes(line)) continue;
      used.add(p.id); out[line] += p.score; n++;
    }
  }
  return out;
}

/** Weighted starting-18 score (ruck at half weight). */
export function starting18(players: { id: number; positions: Line[]; score: number }[]) {
  const t = lineTotals(players);
  return (Object.keys(t) as Line[]).reduce((s, l) => s + t[l] * LINE_WEIGHT[l], 0);
}

export interface Projection { score: number; rank: number; keepers: number[]; drafted: { pick: number; playerId: number }[] }

/** Simulate keepers + the 2027 redraft. picks: 2027 picks with overall number and current owner. */
export function simulate2027(
  players: PlayerRow[], teamIds: number[], picks: { overall: number; owner_team_id: number }[],
): Map<number, Projection> {
  const proj = new Map(players.map((p) => [p.id, projected2027(p)]));
  const a27 = (p: PlayerRow) => age(p.birth_date, SEASON_START_2027) ?? 27;
  const keepValue = (p: PlayerRow) => proj.get(p.id)! + Math.max(0, 24 - a27(p));

  const squads = new Map<number, PlayerRow[]>();
  const keptIds = new Map<number, number[]>();
  for (const t of teamIds) {
    const mine = players.filter((p) => p.team_id === t);
    const set = mine.filter((p) => p.is_keeper || p.is_rookie_keeper);
    const kept = set.length >= 10 ? set : [...mine].sort((x, y) => keepValue(y) - keepValue(x)).slice(0, 18);
    squads.set(t, [...kept]);
    keptIds.set(t, kept.map((p) => p.id));
  }
  const keptAll = new Set([...keptIds.values()].flat());
  const pool = players.filter((p) => !keptAll.has(p.id) && proj.get(p.id)! > 0).sort((x, y) => proj.get(y.id)! - proj.get(x.id)!);
  const drafted = new Map<number, { pick: number; playerId: number }[]>(teamIds.map((t) => [t, []]));
  // Each pick takes the player who adds the most to that team's starting 18 (from the best 40 left), so a team
  // short of forwards drafts forwards instead of a fifth spare midfielder.
  const s18 = (list: PlayerRow[]) => starting18(list.map((p) => ({ id: p.id, positions: p.positions, score: proj.get(p.id)! })));
  for (const pk of [...picks].sort((x, y) => x.overall - y.overall)) {
    if (!pool.length) break;
    const squad = squads.get(pk.owner_team_id);
    let best = 0;
    if (squad) {
      const now = s18(squad);
      let gain = -1;
      pool.slice(0, 40).forEach((c, i) => {
        // Tiny tie-break toward the better player so a full side still takes the best available.
        const g = s18([...squad, c]) - now + proj.get(c.id)! * 0.01;
        if (g > gain) { gain = g; best = i; }
      });
    }
    const [next] = pool.splice(best, 1);
    squad?.push(next);
    drafted.get(pk.owner_team_id)?.push({ pick: pk.overall, playerId: next.id });
  }
  const scores = teamIds.map((t) => ({
    t, score: starting18(squads.get(t)!.map((p) => ({ id: p.id, positions: p.positions, score: proj.get(p.id)! }))),
  })).sort((x, y) => y.score - x.score);
  return new Map(scores.map((s, i) => [s.t, { score: Math.round(s.score), rank: i + 1, keepers: keptIds.get(s.t)!, drafted: drafted.get(s.t)! }]));
}
