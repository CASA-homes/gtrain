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
      const a = age(p.birth_date);
      out.set(p.id, {
        average: to20(avgP),
        ceiling: to20(pct(ceils, Math.max(0, ...xs))),
        floor: to20(pct(floors, xs.length ? Math.min(...xs) : 0)),
        consistency: to20(within * 100),
        durability: to20(dur * 100),
        form: f === 'up' ? 16 : f === 'down' ? 6 : f === 'flat' ? 11 : 1,
        value,
        valueStars: Math.round((value / 20) * 2) / 2,
        potential: potential(p, value, a),
      });
    }
  }
  return out;
}

/**
 * Potential (0–5 stars). Blends draft pedigree, output vs age and runway.
 * Returns null until the stats feed fills birth dates.
 */
export function potential(p: Pick<PlayerRow, 'draft_pick'>, value: number, a: number | null): number | null {
  if (a == null) return null;
  const draft = p.draft_pick ? Math.max(0, 100 - (p.draft_pick - 1) * 1.6) : 40;
  const runway = Math.max(0, Math.min(100, (30 - a) * 10));
  const w = a <= 20 ? [0.4, 0.45, 0.15] : a <= 23 ? [0.15, 0.6, 0.25] : [0, 0.9, 0.1];
  const score = draft * w[0] + value * w[1] + runway * w[2];
  return Math.max(value / 20, Math.round((score / 20) * 2) / 2);
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
