// Premiership window: where a club has been on the ladder, where its list is heading, and what phase each season is.
import { age, curve, type PlayerRow, type Ratings } from '@/lib/ratings';
import { projected2027 } from '@/lib/projection';
import { FINISHES } from '@/lib/window-history';

export type Phase = 'Rebuild' | 'Mid table' | 'Entering window' | 'Prime window' | 'Closing window';
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

/** Each year's redraft refills a list, so a slot is never worth less than a typical drafted player. */
const REPLACEMENT = 72;

/** Projected strength for every team, 2027–2030: best 18 (each slot at least replacement level) plus the captain's doubled score. */
export function strengthByYear(teamIds: number[], players: PlayerRow[], ratings: Map<number, Ratings>,
  lists?: Map<number, { keepers: number[]; drafted: { playerId: number }[] }>) {
  const byId = new Map(players.map((p) => [p.id, p]));
  // The 2027 list: the simulated keepers plus who the redraft gives each club; otherwise the current squad.
  const listOf = (id: number) => {
    const l = lists?.get(id);
    if (!l) return players.filter((p) => p.team_id === id);
    return [...l.keepers, ...l.drafted.map((d) => d.playerId)].map((x) => byId.get(x)).filter((p): p is PlayerRow => !!p);
  };
  const out = new Map<number, Map<number, number>>();
  for (let year = NOW_YEAR + 1; year <= LAST_YEAR; year++) {
    const k = year - NOW_YEAR;
    const m = new Map<number, number>();
    for (const id of teamIds) {
      const vals = listOf(id).map((p) => projectAhead(p, ratings.get(p.id), k)).sort((a, b) => b - a);
      const best = Array.from({ length: 18 }, (_, i) => Math.max(vals[i] ?? 0, REPLACEMENT));
      m.set(id, best.reduce((s2, x) => s2 + x, 0) + best[0]);
    }
    out.set(year, m);
  }
  return out;
}

/** Average age (now) of a team's ten best players on 2027 projections: the core whose age sets the window. */
export function coreAge(teamId: number, players: PlayerRow[]): number {
  const core = players.filter((p) => p.team_id === teamId).sort((a, b) => projected2027(b) - projected2027(a)).slice(0, 10);
  const ages = core.map((p) => age(p.birth_date)).filter((x): x is number => x != null);
  return ages.length ? ages.reduce((s2, x) => s2 + x, 0) / ages.length : 26;
}

/**
 * Phases follow the list lifecycle in order: prime → closing (1–2 years) → mid table → rebuild → mid table →
 * entering (1 year) → prime. Each season is read off a smoothed ladder position (so one odd year doesn't flip it),
 * and a club only moves one step along the cycle at a time.
 *   Prime    top-3ish and holding.
 *   Closing  the decline from a window: one year, or two if the list still has the senior scorers to contend.
 *   Mid table the landing spot after a window, and the first step up out of a rebuild.
 *   Rebuild  bottom of the ladder, building through the draft. One phase, however early or late in it.
 *   Entering one season only: the year a rising list breaks into the top four, then it's prime (or back to mid table).
 */
export function phasesFor(ranks: number[], flags: boolean[], ages: number[]): Phase[] {
  const r = (i: number) => ranks[Math.max(0, Math.min(ranks.length - 1, i))];
  const s = ranks.map((_, i) => 0.25 * r(i - 1) + 0.5 * r(i) + 0.25 * r(i + 1));
  const YOUNG = 22.5, OLD = 28.5;
  const out: Phase[] = [];
  let state: Phase = s[0] <= 3.5 ? 'Prime window' : s[0] >= 7.5 ? 'Rebuild' : 'Mid table';
  let run = 0;
  for (let i = 0; i < ranks.length; i++) {
    const x = s[i], ahead = s[i + 1] ?? x, a = ages[i];
    if (i > 0) {
      const was = state;
      if (state === 'Prime window') {
        if (ahead >= x + 1.5 || (a >= OLD && ahead > x + 0.5) || x > 5) state = 'Closing window';
      } else if (state === 'Closing window') {
        // Still in the top three with a core that isn't old: the window reopens. Otherwise one more year at most.
        if (x <= 3 && a < OLD) state = 'Prime window';
        else if (run >= 2 || x > 4.5) state = x >= 8.5 ? 'Rebuild' : 'Mid table';
      } else if (state === 'Mid table') {
        if (ahead <= 4.5 && ahead <= x - 0.5 && a >= YOUNG) state = 'Entering window';
        else if (x >= 7.5 || (x >= 6 && ahead >= x + 1)) state = 'Rebuild';
      } else if (state === 'Rebuild') {
        if (x <= 6.5 || (x <= 7.5 && ahead <= x - 1)) state = 'Mid table';
      } else if (state === 'Entering window') {
        state = x <= 5.5 ? 'Prime window' : 'Mid table';                 // entering lasts one season
      }
      run = state === was ? run + 1 : 1;
    } else run = 1;
    if (flags[i]) { state = 'Prime window'; run = 1; }
    out.push(state);
  }
  // Fold a lone season between two of the same phase (not the one-year phases, which are meant to be short).
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i - 1] === out[i + 1] && out[i] !== out[i - 1] && !flags[i] && out[i] !== 'Entering window' && out[i] !== 'Closing window') out[i] = out[i - 1];
  }
  return out;
}

/** Commish calls: set a club's phase for particular seasons when the numbers can't see what's coming. */
export const WINDOW_PIN: Record<string, Record<number, Phase>> = {};

const SPREAD: Record<number, number> = { 2027: 0.8, 2028: 1.5, 2029: 2.2, 2030: 2.8 };

export function windowFor(opts: {
  teamId: number; teamName: string; teamIds: number[]; premierYears: number[];
  rank2026: number | null; rank2027: number; strength: Map<number, Map<number, number>>; coreAge: number; futureRank: number;
}): WindowPoint[] {
  const pts: Omit<WindowPoint, 'phase'>[] = [];
  for (let y = FIRST_YEAR; y < NOW_YEAR; y++) {
    const f = FINISHES[y]?.[opts.teamName];
    if (f) pts.push({ year: y, rank: f.rank, kind: f.est ? 'est' : 'actual', flag: opts.premierYears.includes(y), lo: f.rank, hi: f.rank });
  }
  if (opts.rank2026 != null) pts.push({ year: NOW_YEAR, rank: opts.rank2026, kind: 'actual', flag: opts.premierYears.includes(NOW_YEAR), lo: opts.rank2026, hi: opts.rank2026 });
  const rankIn = (y: number) => {
    const m = opts.strength.get(y)!;
    return [...opts.teamIds].sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0)).indexOf(opts.teamId) + 1;
  };
  // 2027: half the redraft simulation, half list strength. Later years lean a little on the year before.
  pts.push({ year: 2027, rank: Math.round((0.5 * opts.rank2027 + 0.5 * rankIn(2027)) * 10) / 10, kind: 'proj', flag: false, lo: 0, hi: 0 });
  // Further out, the future build (best young core, plus the next draft's top picks) counts for more each year.
  const FUTURE_W: Record<number, number> = { 2028: 0.2, 2029: 0.35, 2030: 0.5 };
  for (let y = NOW_YEAR + 2; y <= LAST_YEAR; y++) {
    const prev = pts[pts.length - 1].rank;
    const fw = FUTURE_W[y] ?? 0.5;
    const target = (1 - fw) * rankIn(y) + fw * opts.futureRank;
    pts.push({ year: y, rank: Math.round((0.75 * target + 0.25 * prev) * 10) / 10, kind: 'proj', flag: false, lo: 0, hi: 0 });
  }
  for (const p of pts) if (p.kind === 'proj') { const s = SPREAD[p.year] ?? 2; p.lo = Math.max(1, p.rank - s); p.hi = Math.min(10, p.rank + s); }
  const phases = phasesFor(pts.map((p) => p.rank), pts.map((p) => p.flag), pts.map((p) => opts.coreAge + (p.year - NOW_YEAR)));
  const pin = WINDOW_PIN[opts.teamName] ?? {};
  return pts.map((p, i) => ({ ...p, phase: pin[p.year] ?? phases[i] }));
}
