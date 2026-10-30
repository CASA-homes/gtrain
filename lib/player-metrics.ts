// Flat, derived numbers for every player: what the "Ask" assistant on the Players page queries.
// The AI never sees the raw list; it picks filters and a sort from these, and the server does the maths.
import { age, type Line, type PlayerRow } from '@/lib/ratings';
import { positions2025 } from '@/lib/positions-2025';

export interface Metrics {
  id: number; name: string; full: string; club: string; owner: string; positions: Line[]; positions25: Line[] | null;
  age: number | null;
  avg26: number | null; games26: number; avg25: number | null; games25: number; avg24: number | null;
  jump: number | null;        // avg26 - avg25 (both seasons 5+ games)
  last3: number | null; last5: number | null; last8: number | null;
  trend: number | null;       // last8 - avg26: positive = finishing the year stronger than his season average
  secondHalf: number | null;  // average from round 13 on
  max: number | null; tons: number;  // best score; games of 100+
  tog: number | null; cba: number | null;  // time on ground %, centre-bounce attendance %
  value: number; potential: number | null; keeper: boolean;
}

export const METRIC_KEYS = ['avg26', 'avg25', 'avg24', 'jump', 'last3', 'last5', 'last8', 'trend', 'secondHalf', 'max', 'tons', 'games26', 'games25', 'tog', 'cba', 'age', 'value', 'potential'] as const;
export type MetricKey = typeof METRIC_KEYS[number];

const r1 = (x: number) => Math.round(x * 10) / 10;
const mean = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function metricsFor(p: PlayerRow, owner: string, value: number, potential: number | null): Metrics {
  const log = (p.games_log ?? []).filter((g) => g[1] != null) as [number, number, number | null, number | null][];
  const scores = log.map((g) => g[1]);
  const h = (y: number) => (p.hist ?? []).find((x) => x[0] === y);
  const h25 = h(2025), h24 = h(2024);
  const avg26 = p.average ?? mean(scores);
  const avg25 = h25 && h25[1] > 0 ? r1(h25[2]) : null;
  const last8 = scores.length >= 4 ? mean(scores.slice(-8)) : null;
  const sh = log.filter((g) => (g[0] ?? 0) >= 13).map((g) => g[1]);
  return {
    id: p.id, name: p.name, full: p.full_name ?? p.name, club: p.afl_club ?? '', owner,
    positions: p.positions, positions25: positions2025(p.full_name, p.afl_club),
    age: age(p.birth_date),
    avg26, games26: p.games ?? scores.length, avg25, games25: h25?.[1] ?? 0, avg24: h24 && h24[1] > 0 ? r1(h24[2]) : null,
    jump: avg26 != null && avg25 != null && (p.games ?? 0) >= 5 && (h25?.[1] ?? 0) >= 5 ? r1(avg26 - avg25) : null,
    last3: scores.length >= 3 ? mean(scores.slice(-3)) : null,
    last5: scores.length >= 3 ? mean(scores.slice(-5)) : null,
    last8, trend: last8 != null && avg26 != null ? r1(last8 - avg26) : null,
    secondHalf: sh.length >= 4 ? mean(sh) : null,
    max: scores.length ? Math.max(...scores) : null, tons: scores.filter((s) => s >= 100).length,
    tog: p.box?.tog ?? null, cba: p.box?.cba ?? null,
    value, potential, keeper: !!(p.is_keeper || p.is_rookie_keeper),
  };
}

/** What the model may ask for. Everything is optional; the server ignores anything it doesn't recognise. */
export interface Query {
  title?: string;
  ownership?: 'owned' | 'free' | 'all';
  team?: string | null;          // G-Train team name (partial match)
  club?: string | null;          // AFL club code, e.g. STK
  position?: Line | null;        // current (2026) position
  position2025?: Line | null;
  pureForward?: boolean;         // FWD and nothing else (no MID/RUC/DEF)
  minAge?: number | null; maxAge?: number | null;
  minGames26?: number | null; minGames25?: number | null;
  min?: Partial<Record<MetricKey, number>>; max?: Partial<Record<MetricKey, number>>;
  sortBy?: MetricKey; order?: 'desc' | 'asc'; limit?: number;
  columns?: MetricKey[];
}

export function runQuery(all: Metrics[], q: Query): Metrics[] {
  const sortBy: MetricKey = METRIC_KEYS.includes(q.sortBy as MetricKey) ? (q.sortBy as MetricKey) : 'avg26';
  const team = q.team?.toLowerCase().replace(/[’']/g, "'");
  const rows = all.filter((m) => {
    if (q.ownership === 'owned' && m.owner === 'Free agent') return false;
    if (q.ownership === 'free' && m.owner !== 'Free agent') return false;
    if (team && !m.owner.toLowerCase().replace(/[’']/g, "'").includes(team)) return false;
    if (q.club && m.club !== q.club.toUpperCase()) return false;
    if (q.position && !m.positions.includes(q.position)) return false;
    if (q.position2025 && !(m.positions25 ?? []).includes(q.position2025)) return false;
    if (q.pureForward && !(m.positions.length === 1 && m.positions[0] === 'FWD')) return false;
    if (q.minAge != null && (m.age == null || m.age < q.minAge)) return false;
    if (q.maxAge != null && (m.age == null || m.age > q.maxAge)) return false;
    if (q.minGames26 != null && m.games26 < q.minGames26) return false;
    if (q.minGames25 != null && m.games25 < q.minGames25) return false;
    for (const [k, v] of Object.entries(q.min ?? {})) { const x = m[k as MetricKey]; if (v != null && (x == null || x < v)) return false; }
    for (const [k, v] of Object.entries(q.max ?? {})) { const x = m[k as MetricKey]; if (v != null && (x == null || x > v)) return false; }
    return m[sortBy] != null;
  });
  const dir = q.order === 'asc' ? 1 : -1;
  rows.sort((a, b) => dir * ((a[sortBy] as number) - (b[sortBy] as number)));
  return rows.slice(0, Math.min(Math.max(q.limit ?? 15, 1), 30));
}
