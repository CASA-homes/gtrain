// Value engine v4: one market value for contracts, clauses and the Trademarket. Mirrors kc_value_path in the database
// (migration 0088) step for step, so a player's number is the same wherever it's shown.
//   • Average: his last 30 games, across seasons (logged scores where we have them, else his season average for each
//     game he played). Fewer than 30 games? Topped up with "starting games" at the average his starting price implies.
//   • Value: $0.65k per point of average from 60 up; below 60 it drops to the $10k floor at 45. From 30, −5% a year
//     (never below 70%).
//   • Path: from the start of 2026, game by game, moving at most 5% a game.

export type HistRow = [number, number, number]; // [season, games, average]
export const VALUE_FLOOR = 10;
export const VALUE_CAP = 0.05;
export const VALUE_WINDOW = 30;
export const VALUE_PER_POINT = 0.65;
const FIRST_LOG_SEASON = 2026;
const KNEE = VALUE_PER_POINT * 60;

export const ageFactor = (age: number | null | undefined) => (age == null || age < 30 ? 1 : Math.max(0.7, 1 - 0.05 * (age - 29)));
export const valueFromAvg = (avg: number) => (avg >= 60 ? VALUE_PER_POINT * avg : avg <= 45 ? VALUE_FLOOR : VALUE_FLOOR + ((avg - 45) * (KNEE - VALUE_FLOOR)) / 15);
export const avgFromValue = (k: number) => (k >= KNEE ? k / VALUE_PER_POINT : k <= VALUE_FLOOR ? 45 : 45 + ((k - VALUE_FLOOR) * 15) / (KNEE - VALUE_FLOOR));
export const ageAt = (birth: string | null | undefined, season: number) =>
  birth ? Math.floor((Date.UTC(season, 2, 1) - new Date(birth).getTime()) / (365.25 * 86400000)) : null;
/** Starting price from an AFL draft pick on a league's draft prices (defaults: 30 / 25 / 20 / 15 / 10). */
export const startPriceFromPick = (pick: number | null | undefined, k?: { draft_r1_k?: number; draft_r2_k?: number; draft_r3_k?: number; draft_r4_k?: number; draft_rest_k?: number } | null) =>
  Math.max(VALUE_FLOOR, pick == null ? k?.draft_rest_k ?? 10 : pick <= 10 ? k?.draft_r1_k ?? 30 : pick <= 25 ? k?.draft_r2_k ?? 25
    : pick <= 45 ? k?.draft_r3_k ?? 20 : pick <= 70 ? k?.draft_r4_k ?? 15 : k?.draft_rest_k ?? 10);
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface ValuePoint { season: number; game: number; v: number; target: number }

/** Every value point from the start of 2026 (one point per game) to now. `logs` holds each season's fantasy scores in
 *  order; a season with games but no log uses his average for each game. */
export function valuePath(hist: HistRow[] | null | undefined, logs: Record<number, (number | null)[]>, birth: string | null | undefined,
                          season = 2027, startK = VALUE_FLOOR): ValuePoint[] {
  const h = (hist ?? []).filter((x) => x[1] > 0 && x[0] <= season).sort((a, b) => a[0] - b[0]);
  const agef = ageFactor(ageAt(birth, season));
  const pad = avgFromValue(Math.max(VALUE_FLOOR, startK || VALUE_FLOOR));
  const games: { y: number; s: number }[] = [];
  let i0 = 0;
  for (const [y, g, a] of h) {
    const logged = (logs[y] ?? []).filter((x): x is number => x != null);
    const sc = logged.length ? logged : Array(Math.round(g)).fill(a);
    if (y < FIRST_LOG_SEASON) i0 += sc.length;
    for (const s of sc) games.push({ y, s });
  }
  const out: ValuePoint[] = [];
  let v = 0;
  for (let i = i0; i <= games.length; i++) {
    let sum = 0;
    for (let j = i - VALUE_WINDOW + 1; j <= i; j++) sum += j >= 1 ? games[j - 1].s : pad;
    const t = valueFromAvg(sum / VALUE_WINDOW) * agef;
    v = i === i0 ? t : Math.min(v * (1 + VALUE_CAP), Math.max(v * (1 - VALUE_CAP), t));
    if (i === i0) out.push({ season: i0 < games.length ? games[i0].y : season, game: 0, v: r2(v), target: r2(t) });
    else {
      const y = games[i - 1].y;
      let game = 0; for (let j = 0; j < i; j++) if (games[j].y === y) game++;
      out.push({ season: y, game, v: r2(v), target: r2(t) });
    }
  }
  return out;
}

/** Value now, rounded like the database's rate_k. */
export const valueNow = (path: ValuePoint[]) => Math.round(path[path.length - 1].v);
