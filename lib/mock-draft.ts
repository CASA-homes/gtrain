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
  age: number | null;     // in 2027
  club: string | null;    // AFL club code, or junior club for rookies
  from: string | null;    // G-Train club that released him
  a26: number | null; g26: number;
  a25: number | null; g25: number;
  rank?: number;          // phantom rank (rookies)
  chance?: number;        // crystal-ball star chance (rookies)
  ruck: boolean;
  board: number;          // base board value before team lean / edits
}
export interface MockTeam { id: number; name: string; short: string; window: string; rookieLean: number; vetLean: number; hasGunRuck: boolean }
export interface MockPick { overall: number; round: number; teamId: number }
export interface Edits { out: string[]; adj: Record<string, number> }

const AGE_MULT = (a: number | null) => (a == null ? 1 : a <= 29 ? 1 : a === 30 ? 0.98 : a === 31 ? 0.96 : a === 32 ? 0.93 : a === 33 ? 0.9 : a === 34 ? 0.86 : a === 35 ? 0.82 : a === 36 ? 0.75 : 0.65);

export function rookieBoard(rank: number, role: string, chance: number) {
  const roleMult = role === 'Key position' ? 0.45 : role === 'Ruck' ? 0.8 : role === 'Tall utility' ? 0.85 : role === 'Small forward' ? 0.9 : 1;
  return Math.max(2, (100 - 3.2 * (rank - 1)) * roleMult + (chance - 30) * 0.15);
}

export function playerBoard(p: { a26: number | null; g26: number; a25: number | null; g25: number; age: number | null }) {
  const g26 = p.a26 != null ? p.g26 : 0, g25 = p.a25 != null ? p.g25 : 0;
  const est = (g26 * (p.a26 ?? 0) + 0.5 * g25 * (p.a25 ?? 0) + 6 * 55) / (g26 + 0.5 * g25 + 6);
  const upside = p.age != null && p.age <= 24 && g26 >= 8 ? (24 - p.age) * 1.5 + 2 : 0;
  return Math.max(0, (est * AGE_MULT(p.age) - 50) * 1.9) + upside;
}

/** Last draft's habits plus window: how much each club leans to rookies and to 30+ veterans. */
export function teamLean(name: string, window: string): { rookieLean: number; vetLean: number } {
  const HIST: Record<string, [number, number]> = {
    'Ram Dawgs': [1.15, 0.85], 'Fo’ Sheezel my Neezel': [1.15, 0.9], 'Bito’s Boys': [1.1, 0.9], "Pato's Fantasy Team": [1.05, 0.9], 'Serong So’Right': [1.0, 0.95],
    'A Brayshaw Thing': [0.85, 0.95], 'Bodega Boys': [0.9, 1.05], "Muzza's Murabito's": [0.85, 1.05], 'NSW-ACT Academy': [0.6, 1.12], 'Such Is Fyfe': [0.9, 0.95],
  };
  const [r, v] = HIST[name] ?? [1, 1];
  const w = window === 'Rebuild' ? [0.1, -0.12] : window === 'Win now' ? [-0.12, 0.08] : window === 'Contender' ? [-0.06, 0.05] : [0, 0];
  return { rookieLean: r + w[0], vetLean: v + w[1] };
}

/** Small seeded RNG so a mock can be replayed exactly after an edit. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

export function effectiveBoard(p: MockPlayer, edits: Edits) { return p.board + (edits.adj[p.key] ?? 0); }

/** The AI's choice for a club at a pick. `taken` = this club's picks so far in the mock. */
export function aiPick(team: MockTeam, pool: MockPlayer[], taken: MockPlayer[], edits: Edits, r: () => number): MockPlayer | null {
  const rookiesTaken = taken.filter((p) => p.kind === 'Rookie').length;
  const rucksTaken = taken.filter((p) => p.ruck).length;
  const fade = team.window === 'Rebuild' || team.rookieLean >= 1.1 ? 0.88 : 0.72;
  let best: MockPlayer | null = null, bestScore = -1;
  for (const p of pool) {
    let s = effectiveBoard(p, edits);
    if (p.kind === 'Rookie') s *= team.rookieLean * Math.pow(fade, rookiesTaken);
    else if ((p.age ?? 0) >= 30) s *= team.vetLean;
    if (p.ruck) s *= (team.hasGunRuck ? 0.6 : 1) * Math.pow(0.5, rucksTaken);
    s *= 0.92 + r() * 0.16;   // +/- 8%
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}
