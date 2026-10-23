// Career curve: a player's AFL Fantasy average by age, his projection out to 32, and the path of similar players.
import { curve, projected2027 } from '@/lib/projection';
import { bounceBack } from '@/lib/injury';
import type { Line, PlayerRow } from '@/lib/ratings';

export const CURVE_FROM = 18;
export const CURVE_TO = 32;

export interface CurvePoint { age: number; avg: number; year?: number; games?: number }
export interface CareerCurve {
  actual: CurvePoint[];       // his real seasons (5+ games), solid line
  projected: CurvePoint[];    // from his last real season to 32, dashed (the middle of the range)
  cone: { age: number; lo: number; hi: number }[];   // range of outcomes around the projection
  similar: CurvePoint[];      // similar players on his line, by age
  similarCount: number;       // how many players shaped the similar curve
  prime: [number, number] | null;   // the typical prime window for his position
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
/** Typical fantasy prime by position. */
export const PRIME_BY_LINE: Record<Line, [number, number]> = { MID: [23, 28], DEF: [25, 30], FWD: [24, 28], RUC: [26, 31] };

export function careerCurve(p: PlayerRow, all: PlayerRow[], lineOf: (p: PlayerRow) => Line, potentialStars: number | null = null): CareerCurve {
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
  // For the range: where similar players were k seasons after the age he is now, as a ratio of their level then.
  const ahead = new Map<number, { r: number; w: number }[]>();
  let similarCount = 0;
  for (const o of all) {
    if (o.id === p.id || lineOf(o) !== line) continue;
    const m = byAge(o, 8);
    if (m.size < 2) continue;
    const near = m.get(refAge) ?? m.get(refAge - 1) ?? m.get(refAge + 1);
    const w = near ? Math.exp(-(((near.avg - refAvg) / 10) ** 2)) : 0.1;
    if (w < 0.05) continue;
    if (near && w > 0.4) similarCount++;
    if (near) for (const pt of m.values()) {
      const k = pt.age - near.age;
      if (k < 1 || k > 12) continue;
      const list = ahead.get(k) ?? [];
      list.push({ r: pt.avg / near.avg, w });
      ahead.set(k, list);
    }
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
  // Range of outcomes. Two views, averaged where both exist:
  //   1. What similar players actually did from this age: the 15th to 85th percentile of their later seasons.
  //   2. A rule of thumb: the upside widens with potential stars and youth, the downside is about 12% under the
  //      middle line. Both open up over five seasons, then follow the middle line's shape.
  const pot = potentialStars ?? 2.5;
  const youth = refAge <= 26 ? 1 : refAge <= 29 ? 0.6 : 0.35;
  const upFrac = (0.04 + 0.03 * pot) * youth, downFrac = 0.12;
  const quantile = (xs: { r: number; w: number }[], q: number) => {
    const sorted = [...xs].sort((a, b) => a.r - b.r);
    const total = sorted.reduce((t, x) => t + x.w, 0);
    let acc = 0;
    for (const x of sorted) { acc += x.w; if (acc >= q * total) return x.r; }
    return sorted[sorted.length - 1].r;
  };
  const rawCone = projected.map((pt, i) => {
    if (i === 0) return { age: pt.age, lo: pt.avg, hi: pt.avg, mid: pt.avg };
    const k = pt.age - refAge;
    const t = Math.min(k, 5) / 5;
    let hi = pt.avg * (1 + upFrac * t), lo = pt.avg * (1 - downFrac * t);
    const xs = ahead.get(k);
    if (xs && xs.length >= 5 && xs.reduce((s2, x) => s2 + x.w, 0) >= 2) {
      hi = (hi + refAvg * quantile(xs, 0.85)) / 2;
      lo = (lo + refAvg * quantile(xs, 0.15)) / 2;
    }
    return { age: pt.age, lo, hi, mid: pt.avg };
  });
  // Smooth the edges (comparison data is lumpy year to year) and keep the middle line inside.
  const cone = rawCone.map((k, i) => {
    if (i === 0) return { age: k.age, lo: k.lo, hi: k.hi };
    const nb = rawCone.slice(Math.max(1, i - 1), i + 2);
    const lo = nb.reduce((s2, x) => s2 + x.lo / x.mid, 0) / nb.length * k.mid;
    const hi = nb.reduce((s2, x) => s2 + x.hi / x.mid, 0) / nb.length * k.mid;
    return { age: k.age, lo: Math.round(Math.min(lo, k.mid) * 10) / 10, hi: Math.round(Math.max(hi, k.mid) * 10) / 10 };
  });

  // Prime is a fixed window by position, not read off the projection: rucks and key defenders mature later.
  const prime: [number, number] = PRIME_BY_LINE[line];
  return { actual, projected, cone, similar, similarCount, prime, nowAge, toAge };
}
