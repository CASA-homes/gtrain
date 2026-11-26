// Value engine v3: one market value for contracts, clauses and the Trademarket. Mirrors kc_value_path in the database
// (migration 0086) step for step, so a player's number is the same wherever it's shown.
//   • Average: career average, each older season worth 40% less per year back (0.6^years). This season's games count
//     in full on top, so the average moves a little each game and doesn't jump when a new season starts.
//   • Target: 0.03 × (average − 45)², floor $10k; from 30, −5% a year (never below 70%). No experience multiplier.
//   • Path: from the start of 2026, game by game, the value moves towards the target by at most 4% a game.
//   • A league draft (or rookie) contract anchors the start of that season at the draft salary (never below $10k).

export type HistRow = [number, number, number]; // [season, games, average]
export const VALUE_FLOOR = 10;
export const VALUE_CAP = 0.04;
const DECAY = 0.6;
const FIRST_LOG_SEASON = 2026;

export const ageFactor = (age: number | null | undefined) => (age == null || age < 30 ? 1 : Math.max(0.7, 1 - 0.05 * (age - 29)));
export const targetFromAvg = (avg: number | null, agef = 1) => (avg == null ? VALUE_FLOOR : Math.max(VALUE_FLOOR, 0.03 * Math.max(0, avg - 45) ** 2) * agef);
export const ageAt = (birth: string | null | undefined, season: number) =>
  birth ? Math.floor((Date.UTC(season, 2, 1) - new Date(birth).getTime()) / (365.25 * 86400000)) : null;
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface ValuePoint { season: number; game: number; v: number; target: number }

/** Every value point from the start of 2026 (or his first season) to the league season's start. `logs` holds each
 *  season's fantasy scores in order; a season with games but no log uses his average for each game. */
export function valuePath(hist: HistRow[] | null | undefined, logs: Record<number, (number | null)[]>, birth: string | null | undefined,
                          season = 2027, anchor?: { season: number; k: number } | null): ValuePoint[] {
  const h = (hist ?? []).filter((x) => x[1] > 0).sort((a, b) => a[0] - b[0]);
  const agef = ageFactor(ageAt(birth, season));
  const years = [...new Set([...h.map((x) => x[0]), ...Object.keys(logs).map(Number), season])]
    .filter((y) => y >= Math.min(FIRST_LOG_SEASON, season) && y <= season).sort((a, b) => a - b);
  const out: ValuePoint[] = [];
  let v: number | null = null;
  for (const y of years) {
    let wb = 0, sb = 0;
    for (const [yr, g, a] of h) if (yr < y) { const w = g * DECAY ** (y - yr); wb += w; sb += w * a; }
    let t = wb > 0 ? targetFromAvg(sb / wb, agef) : VALUE_FLOOR;
    v = v == null ? t : Math.min(v * (1 + VALUE_CAP), Math.max(v * (1 - VALUE_CAP), t));
    if (anchor && anchor.season === y) v = Math.max(VALUE_FLOOR, anchor.k);
    out.push({ season: y, game: 0, v: r2(v), target: r2(t) });
    const logged = (logs[y] ?? []).filter((x): x is number => x != null);
    const row = h.find((x) => x[0] === y);
    const scores = logged.length ? logged : row ? Array(Math.round(row[1])).fill(row[2]) : [];
    let k = 0, s = 0;
    for (const sc of scores) {
      k++; s += sc;
      t = targetFromAvg((s + sb) / (k + wb), agef);
      v = Math.min(v * (1 + VALUE_CAP), Math.max(v * (1 - VALUE_CAP), t));
      out.push({ season: y, game: k, v: r2(v), target: r2(t) });
    }
  }
  if (!out.length) out.push({ season, game: 0, v: VALUE_FLOOR, target: VALUE_FLOOR });
  return out;
}

/** Value now, rounded like the database's rate_k. */
export const valueNow = (path: ValuePoint[]) => Math.round(path[path.length - 1].v);
