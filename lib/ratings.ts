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
}

/**
 * Ratings are graded against every rostered player who shares the same primary line,
 * so a ruck's numbers are judged against rucks.
 */
export function buildRatings(all: PlayerRow[]): Map<number, Ratings> {
  const byLine = new Map<Line, PlayerRow[]>();
  for (const p of all) {
    const l = primaryLine(p);
    byLine.set(l, [...(byLine.get(l) ?? []), p]);
  }
  const out = new Map<number, Ratings>();
  for (const [, group] of byLine) {
    const avgs = group.map((p) => p.average ?? 0).sort((a, b) => a - b);
    const ceils = group.map((p) => Math.max(0, ...played(p.last5))).sort((a, b) => a - b);
    const floors = group.map((p) => (played(p.last5).length ? Math.min(...played(p.last5)) : 0)).sort((a, b) => a - b);
    for (const p of group) {
      const xs = played(p.last5);
      const avg = p.average ?? 0;
      const within = avg && xs.length ? xs.filter((s) => Math.abs(s - avg) / avg <= 0.15).length / xs.length : 0;
      const dur = Math.min(1, (p.games ?? 0) / 23);
      const f = form(p);
      const avgP = pct(avgs, avg);
      const value = Math.round(avgP * 0.7 + dur * 100 * 0.15 + within * 100 * 0.15);
      out.set(p.id, {
        average: to20(avgP),
        ceiling: to20(pct(ceils, Math.max(0, ...xs))),
        floor: to20(pct(floors, xs.length ? Math.min(...xs) : 0)),
        consistency: to20(within * 100),
        durability: to20(dur * 100),
        form: f === 'up' ? 16 : f === 'down' ? 6 : f === 'flat' ? 11 : 1,
        value,
        valueStars: Math.round((value / 20) * 2) / 2,
        potential: potential(p),
      });
    }
  }
  return out;
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
export function potential(p: Pick<PlayerRow, 'birth_date' | 'draft_pick' | 'draft_year' | 'career_games' | 'hist' | 'average'>): number | null {
  const a = age(p.birth_date);
  if (a == null) return null;
  const hist = (p.hist ?? []).filter((h) => h[1] > 0);
  const full = hist.filter((h) => h[1] >= 5);
  const cg = p.career_games ?? 0;

  // Current ability: 2026 weighted 60%, 2025 30%, 2024 10%
  const w: Record<number, number> = { [SEASON_NOW]: 0.6, [SEASON_NOW - 1]: 0.3, [SEASON_NOW - 2]: 0.1 };
  let num = 0, den = 0;
  for (const [y, g, f] of hist) if (w[y] && g >= 3) { num += w[y] * f; den += w[y]; }
  const C = abilityStars(den ? num / den : p.average ?? 0);

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
