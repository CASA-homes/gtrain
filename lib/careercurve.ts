// Career curve: a player's AFL Fantasy average by age, his projection out to 32, and the path of similar players.
import { curve, projected2027 } from '@/lib/projection';
import { bounceBack } from '@/lib/injury';
import type { Line, PlayerRow } from '@/lib/ratings';

export const CURVE_FROM = 18;
export const CURVE_TO = 32;

export interface CurvePoint { age: number; avg: number; year?: number; games?: number }
export interface CareerCurve {
  actual: CurvePoint[];       // his real seasons (5+ games), solid line
  projected: CurvePoint[];    // from his last real season to 32, dashed
  similar: CurvePoint[];      // similar players on his line, by age
  similarCount: number;       // how many players shaped the similar curve
  prime: [number, number] | null;   // ages where the projection is within 3% of its peak
  nowAge: number | null;
  toAge: number;              // right edge of the chart: 32, or later for players already older
}

/** Age on 1 July of a season: close enough for "how old was he that year". */
const ageIn = (birth: string, season: number) => {
  const b = new Date(birth);
  let a = season - b.getFullYear();
  if (new Date(season, 6, 1) < new Date(season, b.getMonth(), b.getDate())) a--;
  return a;
};

function byAge(p: PlayerRow, minGames: number): Map<number, CurvePoint> {
  const out = new Map<number, CurvePoint>();
  if (!p.birth_date) return out;
  for (const [year, games, avg] of p.hist ?? []) {
    if (games < minGames || !avg) continue;
    const a = ageIn(p.birth_date, year);
    if (a < CURVE_FROM - 1 || a > 40) continue;
    out.set(a, { age: a, avg, year, games });
  }
  return out;
}

/**
 * Similar players: everyone else valued on the same line, weighted by how close their average was to his at
 * the same age (within ~10 points counts most; no season near his age counts a little). From them we take the
 * typical year-on-year change at each age, and chain it through his current level, so the grey line shows
 * how players like him usually travel before and after this point.
 * Projection: next season is his 2027 projection (age curve, injury blend and known role changes). After that,
 * half the site's age curve and half the similar players' change, so it rises into a prime and then declines.
 */
export function careerCurve(p: PlayerRow, all: PlayerRow[], lineOf: (p: PlayerRow) => Line): CareerCurve {
  const actualMap = byAge(p, 5);
  const actual = [...actualMap.values()].sort((a, b) => a.age - b.age);
  const last = actual[actual.length - 1];
  const nowAge = p.birth_date ? ageIn(p.birth_date, 2026) : null;
  const line = lineOf(p);
  const refAge = last?.age ?? nowAge ?? 24;
  const refAvg = Math.max(last?.avg ?? p.average ?? 0, bounceBack(p)?.blended ?? 0);
  const toAge = Math.max(CURVE_TO, last?.age ?? 0, nowAge ?? 0);

  // Weighted year-on-year change at each age, from similar players.
  const logSum = new Map<number, { w: number; s: number; n: number }>();
  let similarCount = 0;
  for (const o of all) {
    if (o.id === p.id || lineOf(o) !== line) continue;
    const m = byAge(o, 8);
    if (m.size < 2) continue;
    const near = m.get(refAge) ?? m.get(refAge - 1) ?? m.get(refAge + 1);
    const w = near ? Math.exp(-(((near.avg - refAvg) / 10) ** 2)) : 0.1;
    if (w < 0.05) continue;
    if (near && w > 0.4) similarCount++;
    for (const pt of m.values()) {
      const nx = m.get(pt.age + 1);
      if (!nx) continue;
      const r = Math.min(1.3, Math.max(0.75, nx.avg / pt.avg));
      const cur = logSum.get(pt.age) ?? { w: 0, s: 0, n: 0 };
      cur.w += w; cur.s += w * Math.log(r); cur.n++;
      logSum.set(pt.age, cur);
    }
  }
  /** Typical change from age a to a+1: similar players where there's enough of them, the site's age curve otherwise. */
  const step = (a: number) => {
    const c = logSum.get(a);
    const sim = c && c.n >= 3 && c.w >= 0.5 ? Math.exp(c.s / c.w) : null;
    return sim != null ? sim * 0.6 + curve(a + 1) * 0.4 : curve(a + 1);
  };
  // Anchor the grey line on his current season, or for veterans past 31, on his season closest to 27,
  // where there's plenty of comparison data.
  const anchor = refAge <= 31 ? { age: refAge, avg: refAvg }
    : actual.reduce((m, pt) => (Math.abs(pt.age - 27) < Math.abs(m.age - 27) ? pt : m), actual[0]);
  const simMap = new Map<number, number>([[anchor.age, anchor.avg]]);
  for (let a = anchor.age; a < toAge; a++) simMap.set(a + 1, simMap.get(a)! * step(a));
  for (let a = anchor.age; a > CURVE_FROM; a--) simMap.set(a - 1, simMap.get(a)! / step(a - 1));
  const firstAge = Math.max(CURVE_FROM, (actual[0]?.age ?? refAge) - 1);
  const similar: CurvePoint[] = [...simMap.entries()].filter(([a]) => a >= firstAge && a <= CURVE_TO).sort((x, y) => x[0] - y[0])
    .map(([age, avg]) => ({ age, avg: Math.round(avg * 10) / 10 }));

  // Projection
  const projected: CurvePoint[] = [];
  if (last && !p.list_status && (nowAge ?? 99) < CURVE_TO) {
    projected.push({ age: last.age, avg: last.avg });
    const next = projected2027(p);
    let v = next > 0 ? next : last.avg * curve(last.age + 1);
    let a = (nowAge ?? last.age) + 1;
    projected.push({ age: a, avg: Math.round(v * 10) / 10 });
    for (a = a + 1; a <= CURVE_TO; a++) {
      v *= step(a - 1);
      projected.push({ age: a, avg: Math.round(v * 10) / 10 });
    }
  }
  let prime: [number, number] | null = null;
  const future = projected.slice(1);
  if (future.length >= 3) {
    const peak = Math.max(...future.map((x) => x.avg));
    const inPrime = future.filter((x) => x.avg >= peak * 0.97).map((x) => x.age);
    if (inPrime.length) prime = [Math.min(...inPrime), Math.max(...inPrime)];
  }
  return { actual, projected, similar, similarCount, prime, nowAge, toAge };
}
