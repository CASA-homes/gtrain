// Premiership window: where a club has been on the ladder, where its list is heading, and what phase each season is.
import { age, curve, type PlayerRow, type Ratings } from '@/lib/ratings';
import { projected2027 } from '@/lib/projection';
import { FINISHES } from '@/lib/window-history';

export type Phase = 'Early rebuild' | 'Mid rebuild' | 'Entering window' | 'Prime window' | 'Leaving window';
export interface WindowPoint { year: number; rank: number; kind: 'actual' | 'est' | 'proj'; flag: boolean; phase: Phase; lo: number; hi: number }

export const FIRST_YEAR = 2022;
export const NOW_YEAR = 2026;
export const LAST_YEAR = 2030;

/** A player's ceiling from his potential stars (mid scale, so scarce lines come back down by their line bonus). */
const ceilingFor = (stars: number | null, lineBonus: number) => (stars == null ? 95 : 60 + stars * 11) - lineBonus;

/** Projected average k seasons after 2026 (k = 1 is 2027): the 2027 projection, then the age curve each year, young players capped at their potential. */
export function projectAhead(p: PlayerRow, r: Ratings | undefined, k: number): number {
  let v = projected2027(p);
  if (!v) return 0;
  const a0 = age(p.birth_date, new Date(2027, 2, 1)) ?? 26;
  const cap = Math.max(v, ceilingFor(r?.potential ?? null, r?.lineBonus ?? 0));
  for (let y = 1; y < k; y++) {
    const m = curve(a0 + y);
    v = m >= 1 ? Math.min(cap, v * m) : v * m;
  }
  return v;
}

/** Best-18 projected strength for every team, each year 2028–2030. */
export function strengthByYear(teamIds: number[], players: PlayerRow[], ratings: Map<number, Ratings>) {
  const out = new Map<number, Map<number, number>>();
  for (let year = NOW_YEAR + 2; year <= LAST_YEAR; year++) {
    const k = year - NOW_YEAR;
    const m = new Map<number, number>();
    for (const id of teamIds) {
      const vals = players.filter((p) => p.team_id === id).map((p) => projectAhead(p, ratings.get(p.id), k)).sort((a, b) => b - a).slice(0, 18);
      m.set(id, vals.reduce((s, x) => s + x, 0));
    }
    out.set(year, m);
  }
  return out;
}

/**
 * Phases follow the list lifecycle in order: prime → leaving → early rebuild → mid rebuild → entering → prime.
 * Each season is read off a smoothed ladder position (so one odd year doesn't flip the phase), a club can only
 * move one step along that cycle at a time, and a lone season between two of the same phase is folded in.
 */
export function phasesFor(ranks: number[], flags: boolean[]): Phase[] {
  const r = (i: number) => ranks[Math.max(0, Math.min(ranks.length - 1, i))];
  const s = ranks.map((_, i) => 0.25 * r(i - 1) + 0.5 * r(i) + 0.25 * r(i + 1));
  const out: Phase[] = [];
  let state: Phase = s[0] <= 3.5 ? 'Prime window' : s[0] >= 7.5 ? 'Early rebuild' : (s[1] ?? s[0]) < s[0] - 0.75 ? 'Entering window' : 'Mid rebuild';
  let run = 0;
  for (let i = 0; i < ranks.length; i++) {
    const x = s[i], ahead = s[i + 1] ?? x;
    if (i > 0) {
      const was = state;
      if (state === 'Prime window') { if (x > 4.5 && ahead > 4.5) state = 'Leaving window'; }
      else if (state === 'Leaving window') { if (x <= 3.5) state = 'Prime window'; else if (x >= 7 || run >= 2) state = 'Early rebuild'; }
      else if (state === 'Early rebuild') { if (x <= 7.5 && ahead <= x + 0.25) state = 'Mid rebuild'; }
      else if (state === 'Mid rebuild') { if (x <= 5.5 && ahead <= 5.5) state = 'Entering window'; }
      else if (state === 'Entering window') { if (x <= 3.5) state = 'Prime window'; else if (x >= 7) state = 'Mid rebuild'; }
      run = state === was ? run + 1 : 1;
    } else run = 1;
    if (flags[i]) { state = 'Prime window'; run = 1; }
    out.push(state);
  }
  for (let i = 1; i < out.length - 1; i++) if (out[i - 1] === out[i + 1] && out[i] !== out[i - 1] && !flags[i]) out[i] = out[i - 1];
  return out;
}

const SPREAD: Record<number, number> = { 2027: 0.8, 2028: 1.5, 2029: 2.2, 2030: 2.8 };

export function windowFor(opts: {
  teamId: number; teamName: string; teamIds: number[]; premierYears: number[];
  rank2026: number | null; rank2027: number; strength: Map<number, Map<number, number>>;
}): WindowPoint[] {
  const pts: Omit<WindowPoint, 'phase'>[] = [];
  for (let y = FIRST_YEAR; y < NOW_YEAR; y++) {
    const f = FINISHES[y]?.[opts.teamName];
    if (f) pts.push({ year: y, rank: f.rank, kind: f.est ? 'est' : 'actual', flag: opts.premierYears.includes(y), lo: f.rank, hi: f.rank });
  }
  if (opts.rank2026 != null) pts.push({ year: NOW_YEAR, rank: opts.rank2026, kind: 'actual', flag: opts.premierYears.includes(NOW_YEAR), lo: opts.rank2026, hi: opts.rank2026 });
  pts.push({ year: 2027, rank: opts.rank2027, kind: 'proj', flag: false, lo: 0, hi: 0 });
  for (let y = NOW_YEAR + 2; y <= LAST_YEAR; y++) {
    const m = opts.strength.get(y)!;
    const order = [...opts.teamIds].sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0));
    const r = order.indexOf(opts.teamId) + 1;
    // Lean a little on the previous year so one-year jumps don't look sharper than a projection can know.
    const prev = pts[pts.length - 1].rank;
    pts.push({ year: y, rank: Math.round((0.7 * r + 0.3 * prev) * 10) / 10, kind: 'proj', flag: false, lo: 0, hi: 0 });
  }
  for (const p of pts) if (p.kind === 'proj') { const s = SPREAD[p.year] ?? 2; p.lo = Math.max(1, p.rank - s); p.hi = Math.min(10, p.rank + s); }
  const phases = phasesFor(pts.map((p) => p.rank), pts.map((p) => p.flag));
  return pts.map((p, i) => ({ ...p, phase: phases[i] }));
}
