// Match rating out of 10: how good a player's score is for HIM, and for his POSITION.
//
//   par      what a 7.0 score is for this player. Starts at his own average, then pulled toward his position's
//            "starter line" (what the last starting player in the league at that position averages):
//              - below the line: pulled up a little (25%), so a forward's 90 beats a midfielder's 90
//              - above the line: pulled down a lot (75%), so a star doesn't need his own huge average to rate well
//   spread   how many points one step of form is worth: 20% of his average (stars swing further, so a step for
//            Bailey Smith is ~24 points, for Lawson Humphries ~16)
//   rating   7 + 3·tanh(0.78·x) above par (flattens out toward 10), 7 − 4·tanh(0.25·|x|) below (gentler fall),
//            where x = (score − par × fraction of the game played) / spread
//
// Calibrated on 2026 numbers (DEF starter line ≈ 75, MID ≈ 79):
//   Humphries (avg 83, par 77)   77 → 7.0   86 → 8.2   100 → 9.4   120 → 9.9    50 → 5.4
//   Smith     (avg 118, par 89)  90 → 7.1  100 → 8.1   120 → 9.3   150 → 9.9
//   Lord      (avg 78, par 78)   78 → 7.0  100 → 9.4
// Mid-game the expected score is scaled by the fraction played, so ratings start at 7 and firm up as the game goes.

export type Pos = 'DEF' | 'MID' | 'RUC' | 'FWD';
export type PosPars = Record<Pos, number>;
export const POSITIONS: Pos[] = ['DEF', 'MID', 'RUC', 'FWD'];

/** Fallback starter lines (2026, 10 clubs, 5/7/1/5 on field) if the player pool is too thin to work them out. */
export const DEFAULT_PARS: PosPars = { DEF: 75.5, MID: 78.3, RUC: 81.8, FWD: 72 };

const PULL_UP = 0.25, PULL_DOWN = 0.75, SPREAD = 0.2, MIN_SPREAD = 10, UP = 0.78, DOWN = 0.25;

/**
 * Each position's starter line: the average of the Nth best player there, N = clubs × starting slots.
 * Dual-position players count in both. Only players with enough games count.
 */
export function positionPars(
  pool: { positions: string[]; average: number | null; games: number | null }[],
  clubs = 10,
  slots: Record<Pos, number> = { DEF: 5, MID: 7, RUC: 1, FWD: 5 },
  minGames = 8,
): PosPars {
  const out = { ...DEFAULT_PARS };
  for (const pos of POSITIONS) {
    const avgs = pool.filter((p) => p.positions.includes(pos) && (p.games ?? 0) >= minGames && p.average != null)
      .map((p) => p.average!).sort((a, b) => b - a);
    const n = clubs * slots[pos];
    if (avgs.length >= n) out[pos] = Math.round(avgs[n - 1] * 10) / 10;
  }
  return out;
}

/**
 * The average a player is judged against: this season's average, leaning on last season until he has played a few.
 * prev falls back to a projection for players with little history.
 */
export function baseAverage(o: { prevAvg: number | null; prevGames: number | null; curAvg?: number | null; curGames?: number | null; proj?: number | null }): number {
  const pg = o.prevGames ?? 0;
  const proj = o.proj ?? o.prevAvg ?? 60;
  const prev = o.prevAvg == null ? proj : pg >= 6 ? o.prevAvg : (o.prevAvg * pg + proj * (6 - pg)) / 6;
  const g = o.curGames ?? 0;
  if (!g || o.curAvg == null) return prev;
  return (o.curAvg * g + prev * 5) / (g + 5);
}

/** The position he's judged at: where he's playing, else his best-rated position (lowest starter line). */
export function ratingPos(line: string | null | undefined, positions: string[], pars: PosPars): Pos {
  if (line && POSITIONS.includes(line as Pos)) return line as Pos;
  const ps = positions.filter((p): p is Pos => POSITIONS.includes(p as Pos));
  if (!ps.length) return 'MID';
  return ps.reduce((a, b) => (pars[b] < pars[a] ? b : a));
}

export interface RatingBasis { avg: number; par: number; spread: number; pos: Pos }

export function ratingBasis(avg: number, pos: Pos, pars: PosPars): RatingBasis {
  const line = pars[pos];
  const par = avg + (line - avg) * (avg < line ? PULL_UP : PULL_DOWN);
  return { avg: Math.round(avg * 10) / 10, par: Math.round(par * 10) / 10, spread: Math.max(MIN_SPREAD, avg * SPREAD), pos };
}

/** Rating out of 10 (one decimal). played = fraction of his game done (1 once it's over). */
export function matchRating(score: number, b: RatingBasis, played = 1): number {
  const x = (score - b.par * played) / b.spread;
  const r = x >= 0 ? 7 + 3 * Math.tanh(UP * x) : 7 - 4 * Math.tanh(DOWN * -x);
  return Math.round(Math.min(10, Math.max(3, r)) * 10) / 10;
}

/** Score that would earn a given rating at full time (for "a 9 needs 100" style hints). */
export function scoreFor(rating: number, b: RatingBasis): number {
  const d = rating - 7;
  const x = d >= 0 ? Math.atanh(Math.min(0.999, d / 3)) / UP : -Math.atanh(Math.min(0.999, -d / 4)) / DOWN;
  return Math.round(b.par + x * b.spread);
}
