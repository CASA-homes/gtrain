import { bounceBack } from '@/lib/injury';
// League maths: colour bands, Best 22, 1–20 ratings, value scores and team status.
// Every number on the site comes from these functions so the rules live in one place.

export type Line = 'DEF' | 'MID' | 'RUC' | 'FWD';
export const LINES: Line[] = ['DEF', 'MID', 'RUC', 'FWD'];

export interface PlayerRow {
  id: number;
  name: string;
  positions: Line[];
  afl_club: string | null;
  team_id: number;
  is_keeper: boolean;
  is_rookie_keeper: boolean;
  games: number | null;
  average: number | null;
  last5: (number | null)[];
  status: string | null;
  birth_date: string | null;
  draft_pick: number | null;
  draft_year: number | null;
  full_name: string | null;
  dfs_id: string | null;
  height_cm: number | null;
  debut_year: number | null;
  career_games: number | null;
  box: Box | null;
  hist: Hist[] | null;
  photo_path: string | null;
  list_status: string | null;   // Retired / Delisted / long-term injury: out of 2027 projections
  lineup: Slot | null;
}

/** [season, games, AFL Fantasy average] for every AFL season, from DFS. */
export type Hist = [number, number, number];

export type Slot = Line | 'BENCH';

/** 2026 per-game averages from DFS Australia. */
export interface Box {
  gm?: number; k?: number; h?: number; m?: number; t?: number; ho?: number; ff?: number; fa?: number;
  g?: number; b?: number; tog?: number; cba?: number; de?: number; ki?: number; rc?: number; mx?: number; ppm?: number;
  cp?: number; up?: number; cl?: number; mg?: number; i5?: number; r5?: number; it?: number; cm?: number; mi5?: number; rp?: number;
}

// ---------------------------------------------------------------- colours
export const C = {
  ink: '#151a16', muted: '#6b726c', line: '#e4e7e1',
  green5: '#1f6b3a', green4: '#4f9a5f', green3: '#9ccb84', green2: '#d6e49a', yellow: '#f1e8a8',
  redBg: '#f3c2b9', redFg: '#7a1d12', empty: '#eceee9',
  DEF: '#3f7fb5', MID: '#c48a1f', RUC: '#7a5fc0', FWD: '#d0583f',
};

/** Average chip: dark green 100+, lighter green, light yellow under 70. */
export function avgColour(a: number | null): [string, string] {
  if (a == null) return [C.empty, C.muted];
  if (a >= 100) return [C.green5, '#fff'];
  if (a >= 90) return [C.green4, '#fff'];
  if (a >= 80) return [C.green3, C.ink];
  if (a >= 70) return [C.green2, C.ink];
  return [C.yellow, C.ink];
}

/** Single score: dark green 120+, green 100+, light green 70+, yellow 50s–60s, red under 50. */
export function scoreColour(s: number | null): [string, string] {
  if (s == null) return [C.empty, C.muted];
  if (s >= 120) return [C.green5, '#fff'];
  if (s >= 100) return [C.green4, '#fff'];
  if (s >= 70) return [C.green3, C.ink];
  if (s >= 50) return [C.yellow, C.ink];
  return [C.redBg, C.redFg];
}

/** 1–20 attribute bar: dark green strong → light yellow weak. */
export function scale20(v: number): string {
  if (v >= 17) return C.green5;
  if (v >= 13) return C.green4;
  if (v >= 9) return C.green3;
  if (v >= 5) return C.green2;
  return C.yellow;
}

// ---------------------------------------------------------------- per-player
export const played = (xs: (number | null)[]) => xs.filter((x): x is number => x != null);

export function age(birth: string | null, at = new Date()): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  let a = at.getFullYear() - b.getFullYear();
  if (at < new Date(at.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

export type Form = 'up' | 'flat' | 'down' | null;
/** Form: last-5 average against season average, ±6% either way. */
export function form(p: Pick<PlayerRow, 'last5' | 'average'>): Form {
  const xs = played(p.last5);
  if (xs.length < 2 || !p.average) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const d = (m - p.average) / p.average;
  return d > 0.06 ? 'up' : d < -0.06 ? 'down' : 'flat';
}

export function primaryLine(p: Pick<PlayerRow, 'positions'>): Line {
  for (const l of ['RUC', 'DEF', 'FWD', 'MID'] as Line[]) if (p.positions.includes(l) && p.positions.length === 1) return l;
  return p.positions.includes('MID') ? 'MID' : (p.positions[0] ?? 'MID');
}

/** Rank-percentile of x within a sorted ascending array, 0–100. */
function pct(sorted: number[], x: number) {
  if (!sorted.length) return 50;
  let below = 0;
  for (const v of sorted) if (v < x) below++;
  return (below / sorted.length) * 100;
}
const to20 = (p: number) => Math.max(1, Math.min(20, Math.round(p / 5)));

export interface Ratings {
  average: number; ceiling: number; floor: number; consistency: number; durability: number; form: number;
  value: number;          // 0–100
  valueStars: number;     // 0–5 in halves
  potential: number | null;  // 0–5 stars, null until age/draft data arrives
  line: Line;             // the position he's valued at: whichever eligible line he ranks highest in
  lineRank: number;       // his rank by average among everyone eligible for that line
  lineEdge: number;       // points above a typical starter on that line
  statusRisk: boolean;    // dual-position player whose role suggests he'll lose the scarcer position
  lineBonus: number;      // points added to put him on the midfield scale (scarce lines score lower)
}

/** Starters league-wide per line (10 teams). The average of these is the "typical starter" benchmark. */
const STARTERS: Record<Line, number> = { DEF: 50, MID: 70, RUC: 10, FWD: 50 };
/** When a player ranks equally on two lines, value him at the scarcer one. */
const SCARCITY_ORDER: Line[] = ['FWD', 'RUC', 'DEF', 'MID'];

/**
 * Ratings are graded against everyone eligible for the same line. A dual-position player is valued at whichever
 * of his lines he ranks highest in, because that's where a coach will play him: a 92-average MID/FWD is ordinary
 * as a midfielder but elite as a forward, and his value reflects the forward ranking.
 */
export function buildRatings(rows: PlayerRow[]): Map<number, Ratings> {
  // Injured players are valued on their blended average (recent peak + interrupted 2026), not the injury-hit number.
  const all = rows.map((p) => { const bb = bounceBack(p); return bb && bb.blended > (p.average ?? 0) ? { ...p, average: bb.blended } : p; });
  const pool = new Map<Line, PlayerRow[]>(LINES.map((l) => [l, all.filter((p) => p.positions.includes(l))]));
  const sortedAvg = new Map(LINES.map((l) => [l, pool.get(l)!.map((p) => p.average ?? 0).sort((a, b) => a - b)]));
  const sortedCeil = new Map(LINES.map((l) => [l, pool.get(l)!.map((p) => Math.max(0, ...played(p.last5))).sort((a, b) => a - b)]));
  const sortedFloor = new Map(LINES.map((l) => [l, pool.get(l)!.map((p) => (played(p.last5).length ? Math.min(...played(p.last5)) : 0)).sort((a, b) => a - b)]));
  const benchmark = new Map(LINES.map((l) => {
    const top = [...sortedAvg.get(l)!].reverse().slice(0, STARTERS[l]);
    return [l, top.length ? top.reduce((s2, x) => s2 + x, 0) / top.length : 0];
  }));

  const out = new Map<number, Ratings>();
  for (const p of all) {
    const xs = played(p.last5);
    const avg = p.average ?? 0;
    const eligible = (p.positions.length ? p.positions : [primaryLine(p)]).filter((l) => pool.has(l));
    // Best line: highest percentile, scarcer line on ties.
    const line = [...eligible].sort((x, y) => (pct(sortedAvg.get(y)!, avg) - pct(sortedAvg.get(x)!, avg)) || (SCARCITY_ORDER.indexOf(x) - SCARCITY_ORDER.indexOf(y)))[0];
    const avgs = sortedAvg.get(line)!;
    const within = avg && xs.length ? xs.filter((s2) => Math.abs(s2 - avg) / avg <= 0.15).length / xs.length : 0;
    const dur = Math.min(1, (p.games ?? 0) / 23);
    const f = form(p);
    const avgP = pct(avgs, avg);
    const lineRank = avgs.filter((x) => x > avg).length + 1;
    const value = avg ? valueFromRank(line, lineRank, { avg, dur, downside: downsideShare(xs, avg), injuredBlend: p !== rows.find((r) => r.id === p.id) }) : 0;
    // A forward or defender who also holds MID and is living in the centre square may lose the scarcer status.
    const statusRisk = line !== 'MID' && p.positions.includes('MID') && (p.box?.cba ?? 0) >= 50;
    // A forward's 92 is worth a midfielder's 102: lift scarce-line scoring onto the midfield scale for potential.
    const lineBonus = Math.max(0, Math.round(benchmark.get('MID')! - benchmark.get(line)!));
    out.set(p.id, {
      average: to20(avgP),
      ceiling: to20(pct(sortedCeil.get(line)!, Math.max(0, ...xs))),
      floor: to20(pct(sortedFloor.get(line)!, xs.length ? Math.min(...xs) : 0)),
      consistency: to20(within * 100),
      durability: to20(dur * 100),
      form: f === 'up' ? 16 : f === 'down' ? 6 : f === 'flat' ? 11 : 1,
      value,
      valueStars: starsFromValue(value),
      potential: potential(p, lineBonus),
      line, lineRank, lineBonus,
      lineEdge: Math.round((avg - benchmark.get(line)!) * 10) / 10,
      statusRisk,
    });
  }
  return out;
}

/**
 * Value is about scarcity: where a player ranks on his line against how many starters that line needs across
 * the league (10 teams × 5 DEF / 7 MID / 1 RUC / 5 FWD). Being 10th of 50 forwards is worth the same as
 * 14th of 70 midfielders, so a 90 forward can match a 100+ midfielder.
 *   top 10% of starters → 5 stars, top 25% → 4.5, top 45% → 4, top 70% → 3.5, a starter → 3, then depth.
 * Anyone averaging 105+ is 5 stars. Injured players are ranked on their blended average but top out at 4.5.
 * Durability and consistency can only take off up to half a star, never for the top 10%, and big scores never
 * count against a player (only scores well below his average do).
 */
const VALUE_CURVE: [number, number][] = [[0, 100], [0.1, 95], [0.25, 85], [0.45, 75], [0.7, 65], [1, 55], [1.4, 45], [2, 35], [3, 25], [5, 10], [99, 0]];
export function valueFromRank(line: Line, rank: number, o: { avg: number; dur: number; downside: number; injuredBlend: boolean }): number {
  const rel = (rank - 0.5) / STARTERS[line];
  let v = 0;
  for (let i = 1; i < VALUE_CURVE.length; i++) {
    const [r0, v0] = VALUE_CURVE[i - 1], [r1, v1] = VALUE_CURVE[i];
    if (rel <= r1) { v = v0 + ((rel - r0) / (r1 - r0)) * (v1 - v0); break; }
  }
  if (rel > 0.1) {
    let pen = 0;
    if (!o.injuredBlend && o.dur < 0.5) pen += 5;        // missed half the season (blended players already priced in)
    if (o.downside >= 0.6) pen += 5;                      // 3+ of his last 5 well below his average
    v -= Math.min(5, pen);
  }
  if (o.avg >= 104.5 && !o.injuredBlend) v = Math.max(v, 95); // 105+ is elite on any line
  if (o.injuredBlend) v = Math.min(v, 94);                    // a blended (injury-hit) player tops out at 4.5 stars
  return Math.max(0, Math.round(v));
}
/** Share of recent scores more than 20% below his average. High scores never count against him. */
function downsideShare(xs: number[], avg: number) {
  return xs.length && avg ? xs.filter((x) => x < avg * 0.8).length / xs.length : 0;
}
export function starsFromValue(v: number): number {
  for (const [t, st] of [[95, 5], [85, 4.5], [75, 4], [65, 3.5], [55, 3], [45, 2.5], [35, 2], [25, 1.5], [10, 1]] as const) if (v >= t) return st;
  return v > 0 ? 0.5 : 0;
}

/** The typical-starter average for each line, for copy like "worth 14 points over a typical forward". */
export function lineBenchmarks(all: PlayerRow[]): Record<Line, number> {
  return Object.fromEntries(LINES.map((l) => {
    const top = all.filter((p) => p.positions.includes(l)).map((p) => p.average ?? 0).sort((a, b) => b - a).slice(0, STARTERS[l]);
    return [l, Math.round(top.reduce((s2, x) => s2 + x, 0) / Math.max(1, top.length))];
  })) as Record<Line, number>;
}

/** Current ability in stars from a recent average (100 ≈ 4.5 stars). */
export function abilityStars(avg: number): number {
  for (const [t, st] of [[108, 5], [99, 4.5], [92, 4], [85, 3.5], [78, 3], [70, 2.5], [62, 2], [54, 1.5], [46, 1]] as const) if (avg >= t) return st;
  return 0.5;
}

const SEASON_NOW = 2026;
/** What a typical player averages in his nth AFL season. */
const EXPECTED = [55, 55, 65, 75, 82, 88];
const halfStar = (x: number) => Math.max(0.5, Math.min(5, Math.round(x * 2) / 2));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Potential (0.5–5 stars). Where a player is heading, not where he is.
 *
 * Young players (23 and under, or in their first three seasons):
 *   - Scoring against what's normal for his season number (a 3rd-year averaging 81 is ahead of the curve),
 *     plus the jump from last season. This is the main driver.
 *   - Draft pedigree adds to it: top 5 picks ≈ 4.5★, 6–10 ≈ 4★, 11–20 ≈ 3.5★, 21–40 ≈ 3★.
 *     It counts for less the more games he plays, and fades each year he stays on the fringe.
 * Prime (24–27): current ability, with a little extra if he's still climbing.
 * 28+: current ability less an age drop (29 −0.5, 30–32 −1, 33+ −1.5).
 */
export function potential(p: Pick<PlayerRow, 'birth_date' | 'draft_pick' | 'draft_year' | 'career_games' | 'hist' | 'average'>, lineBonus = 0): number | null {
  const a = age(p.birth_date);
  if (a == null) return null;
  const hist = (p.hist ?? []).filter((h) => h[1] > 0);
  const full = hist.filter((h) => h[1] >= 5);
  const cg = p.career_games ?? 0;

  // Current ability: 2026 weighted 60%, 2025 30%, 2024 10%
  const w: Record<number, number> = { [SEASON_NOW]: 0.6, [SEASON_NOW - 1]: 0.3, [SEASON_NOW - 2]: 0.1 };
  let num = 0, den = 0;
  for (const [y, g, f] of hist) if (w[y] && g >= 3) { num += w[y] * f; den += w[y]; }
  // Scarce-line players' current ability is judged on the midfield scale (see buildRatings).
  const C = abilityStars((den ? num / den : p.average ?? 0) + lineBonus);

  if (a <= 23 || (hist.length <= 3 && a <= 25)) {
    let S: number;
    if (full.length) {
      const [yr, , f] = full[full.length - 1];
      const n = hist.filter((h) => h[0] <= yr).length;
      S = 3 + (f / EXPECTED[Math.min(n, 5)] - 1) * 5;
      if (full.length >= 2) S += clamp((full[full.length - 1][2] - full[full.length - 2][2]) / 15, -0.75, 1.5);
      S -= Math.max(0, a - 22) * 0.3;
    } else if (hist.length) {
      S = 3 + (hist[hist.length - 1][2] / EXPECTED[1] - 1) * 5;
    } else S = 3;
    S = 3 + (S - 3) * Math.min(1, cg / 20); // small samples lean to neutral

    let D = 2.5;
    if (p.draft_pick && p.draft_pick <= 40) {
      const pk = p.draft_pick;
      D = pk <= 5 ? 4.5 : pk <= 10 ? 4 : pk <= 20 ? 3.5 : 3;
      const seasonsSince = p.draft_year ? SEASON_NOW - p.draft_year : 0;
      D = Math.max(2.5, D - 0.5 * Math.max(0, seasonsSince - 1) * (1 - Math.min(1, cg / 40)));
    }
    const wS = 0.8 * Math.min(1, cg / 40);
    let P = S + (1 - wS) * Math.max(0, D - S);
    if (a <= 21) P += 0.25;
    return halfStar(Math.max(P, C));
  }
  if (a <= 27) {
    const slope = full.length >= 2 ? full[full.length - 1][2] - full[full.length - 2][2] : 0;
    return halfStar(C + (a <= 26 ? clamp(slope / 20, 0, 0.5) : 0));
  }
  const drop = a === 28 ? 0 : a === 29 ? 0.5 : a <= 32 ? 1 : 1.5;
  return halfStar(C - drop);
}

// ---------------------------------------------------------------- team level
export const LINE_SLOTS: Record<Line, number> = { DEF: 5, MID: 7, RUC: 1, FWD: 5 };
export const BENCH_SLOTS = 4;

export interface Best22 {
  lines: Record<Line, PlayerRow[]>;
  bench: PlayerRow[];
  extended: PlayerRow[];
}

/** Picks the strongest 5 DEF / 7 MID / 1 RUC / 5 FWD + 4 bench by 2026 average, filling scarce lines first. */
export function best22(players: PlayerRow[]): Best22 {
  const sorted = [...players].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const lines: Record<Line, PlayerRow[]> = { DEF: [], MID: [], RUC: [], FWD: [] };
  const used = new Set<number>();
  for (const line of ['RUC', 'DEF', 'FWD', 'MID'] as Line[]) {
    for (const p of sorted) {
      if (lines[line].length >= LINE_SLOTS[line]) break;
      if (used.has(p.id) || !p.positions.includes(line)) continue;
      // Leave a dual-position player for a scarcer line only if that line still needs him.
      lines[line].push(p);
      used.add(p.id);
    }
  }
  const rest = sorted.filter((p) => !used.has(p.id));
  return { lines, bench: rest.slice(0, BENCH_SLOTS), extended: rest.slice(BENCH_SLOTS) };
}

/** The coach's saved lineup, or null if they haven't set a complete one. */
export function savedLineup(players: PlayerRow[]): Best22 | null {
  if (!players.some((p) => p.lineup)) return null;
  const by = (s: Slot) => players.filter((p) => p.lineup === s).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const lines = { DEF: by('DEF'), MID: by('MID'), RUC: by('RUC'), FWD: by('FWD') };
  const extended = players.filter((p) => !p.lineup).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  return { lines, bench: by('BENCH'), extended };
}

export const best18Total = (b: Best22) =>
  LINES.flatMap((l) => b.lines[l]).reduce((a, p) => a + (p.average ?? 0), 0);

export type Status = 'Strong contender' | 'Top 4 contender' | 'Mid-table' | 'Rebuilding';
export const STATUSES: Status[] = ['Strong contender', 'Top 4 contender', 'Mid-table', 'Rebuilding'];
export function statusFromRank(rank: number): Status {
  return rank <= 2 ? 'Strong contender' : rank <= 4 ? 'Top 4 contender' : rank <= 7 ? 'Mid-table' : 'Rebuilding';
}

export const AGE_PHASES = [
  { name: 'Youngsters', range: 'under 23', from: 0 },
  { name: 'Near-prime', range: '23–24', from: 23 },
  { name: 'Prime', range: '25–27', from: 25 },
  { name: 'Matured', range: '28–30', from: 28 },
  { name: 'Ageing', range: '31+', from: 31 },
] as const;
export function agePhase(avgAge: number) {
  let i = 0;
  AGE_PHASES.forEach((p, k) => { if (avgAge >= p.from) i = k; });
  return i;
}
