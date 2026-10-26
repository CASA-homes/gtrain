// Mock draft engine. Runs entirely in the browser.
//
// Board value (one scale for everyone, tuned to how the 2026 G-Train draft actually went):
//   Rookies    100 for the top prospect, about -3.2 per phantom rank. Key-position talls slide hard (Harry Dean went 103),
//              rucks and tall utilities a little. Star chance nudges it.
//   Everyone   established output: 2026 average with a small-sample pull toward 55, plus 2025 at half weight;
//   else       older players discounted; 24-and-unders who played real games get an upside bump.
// Team picks (data/draft-behaviour-2026.json + window):
//   Each club leans toward rookies or proven veterans according to its window and what it did last draft.
//   The lean fades as it fills up: a second and third rookie are less likely unless it's rebuilding.
//   Clubs that kept a gun ruck rarely take another. A little seeded randomness so every mock differs.
// Coach's edits (saved on this device) adjust board value: retired = gone, too high = -12, too low = +12, per click.

export type Kind = 'Rookie' | 'Released' | 'Free agent';
export interface MockPlayer {
  key: string;            // p:<id> or r:<name>
  id: number | null;      // site player id (null for draftees not yet on a list)
  name: string;
  kind: Kind;
  pos: string;            // DEF/MID etc, or the prospect's role
  lines: string[];        // DEF / MID / RUC / FWD, for filtering
  age: number | null;     // in 2027
  club: string | null;    // AFL club code, or junior club for rookies
  from: string | null;    // G-Train club that released him
  a26: number | null; g26: number;
  a25: number | null; g25: number;
  rank?: number;          // phantom rank (rookies)
  chance?: number;        // crystal-ball star chance (rookies)
  ruck: boolean;
  board: number;          // neutral board value (half now, half future), for display
  now: number;            // 2027 points value
  fut: number;            // long-term value
}
export interface MockTeam { id: number; name: string; short: string; window: string; wNow: number; hasGunRuck: boolean; oneRookieEarly?: boolean }
export interface MockPick { overall: number; round: number; teamId: number }
export interface Edits { out: string[]; adj: Record<string, number> }

// 2027 points: established output, with age only trimming it a little (a 98-average veteran is still a 2027 asset).
const AGE_NOW = (a: number | null) => (a == null || a <= 29 ? 1 : a <= 31 ? 0.98 : a === 32 ? 0.96 : a === 33 ? 0.94 : a === 34 ? 0.92 : a === 35 ? 0.9 : a === 36 ? 0.87 : 0.84);
// Long-term value: how many good keeper years are left.
const LONGEVITY = (a: number | null) => (a == null ? 1 : a <= 24 ? 1.15 : a <= 27 ? 1 : a <= 29 ? 0.85 : a <= 31 ? 0.6 : a <= 33 ? 0.4 : 0.2);

/** A rookie's long-term value from his phantom rank: key-position talls slide hard, star chance nudges it. */
export function rookieFuture(rank: number, role: string, chance: number) {
  const roleMult = role === 'Key position' ? 0.45 : role === 'Ruck' ? 0.8 : role === 'Tall utility' ? 0.85 : role === 'Small forward' ? 0.9 : 1;
  return Math.max(2, ((100 - 3.2 * (rank - 1)) * roleMult + (chance - 30) * 0.15) * 1.25);
}

/** Expected 2027 average: 2026 with a small-sample pull toward 55, 2025 at half weight, lightly aged. */
export function expected2027(p: { a26: number | null; g26: number; a25: number | null; g25: number; age: number | null }) {
  const g26 = p.a26 != null ? p.g26 : 0, g25 = p.a25 != null ? p.g25 : 0;
  const est = (g26 * (p.a26 ?? 0) + 0.5 * g25 * (p.a25 ?? 0) + 6 * 55) / (g26 + 0.5 * g25 + 6);
  return est * AGE_NOW(p.age);
}
export function nowFut(p: { a26: number | null; g26: number; a25: number | null; g25: number; age: number | null }) {
  const now = Math.max(0, (expected2027(p) - 50) * 2.2);
  const upside = p.age != null && p.age <= 24 && p.g26 >= 8 ? (24 - p.age) * 2 + 3 : 0;
  return { now, fut: now * LONGEVITY(p.age) + upside };
}

/**
 * How much a club values 2027 points over the future (0 = all future, 1 = all now).
 * Base: 2026 regular-season wins (17 wins = 0.9, 2 wins = 0.15). Then the club's own habits from the 2026 draft
 * and the commish's read: NSW-ACT drafted all win-now, Pato's took rookies early despite contending,
 * Fyfe mixes a rookie with win-now, Fo' Sheezel is rebuilding.
 */
export function wNowFor(name: string, wins: number | null) {
  const base = 0.15 + 0.75 * Math.max(0, Math.min(1, ((wins ?? 9) - 2) / 15));
  const ADJ: Record<string, number> = { 'NSW-ACT Academy': 0.15, "Pato's Fantasy Team": -0.15, 'Such Is Fyfe': -0.2, 'Fo’ Sheezel my Neezel': -0.15 };
  return Math.max(0.1, Math.min(0.92, base + (ADJ[name] ?? 0)));
}
/** Clubs that take one rookie with their first two picks whatever else they do (commish's read on Fyfe). */
export const ONE_ROOKIE_EARLY = new Set(['Such Is Fyfe']);
export function windowLabel(w: number) { return w >= 0.8 ? 'Win now' : w >= 0.6 ? 'Contending' : w >= 0.4 ? 'Balanced' : 'Rebuilding'; }

/** Small seeded RNG so a mock can be replayed exactly after an edit. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}


/** Neutral rating shown in the list: half 2027 points, half long-term, plus the coach's edits. */
export function effectiveBoard(p: MockPlayer, edits: Edits) { return 0.5 * p.now + 0.5 * p.fut + (edits.adj[p.key] ?? 0); }

/** The AI's choice for a club at a pick. `taken` = this club's picks so far in the mock. */
export function aiPick(team: MockTeam, pool: MockPlayer[], taken: MockPlayer[], edits: Edits, r: () => number): MockPlayer | null {
  const rookiesTaken = taken.filter((p) => p.kind === 'Rookie').length;
  const rucksTaken = taken.filter((p) => p.ruck).length;
  const fade = team.wNow < 0.4 ? 0.9 : team.wNow < 0.6 ? 0.75 : 0.55;   // a contender's second rookie is a long shot
  // "One rookie, one win-now": if the first pick wasn't a rookie, the second one is (if a decent rookie is left).
  if (team.oneRookieEarly && taken.length === 1 && rookiesTaken === 0) {
    const rk = pool.filter((p) => p.kind === 'Rookie' && p.fut >= 70).sort((a, b) => (b.fut + (edits.adj[b.key] ?? 0)) - (a.fut + (edits.adj[a.key] ?? 0)))[0];
    if (rk) return rk;
  }
  let best: MockPlayer | null = null, bestScore = -Infinity;
  for (const p of pool) {
    let s = team.wNow * p.now + (1 - team.wNow) * p.fut;
    if (p.kind === 'Rookie') s *= Math.pow(fade, rookiesTaken);
    if (p.ruck) s *= (team.hasGunRuck ? 0.6 : 1) * Math.pow(0.5, rucksTaken);
    s += edits.adj[p.key] ?? 0;
    s *= 0.92 + r() * 0.16;   // +/- 8%
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}

/** Lines for a draft prospect from his profile position, e.g. "MID/FWD", "Key DEF", "Wing/MID". */
export function prospectLines(position: string, role: string): string[] {
  const s = (position || '').toUpperCase(), out = new Set<string>();
  if (s.includes('DEF')) out.add('DEF');
  if (s.includes('MID') || s.includes('WING')) out.add('MID');
  if (s.includes('FWD')) out.add('FWD');
  if (s.includes('RUC') || role === 'Ruck') out.add('RUC');
  if (!out.size) { if (/utility/i.test(position)) { out.add('DEF'); out.add('FWD'); } else out.add('MID'); }
  return [...out];
}
