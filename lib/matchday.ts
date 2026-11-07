// Matchday: every game a club can set a team for, described by one set of rules so a single lineup builder serves them all.
// G-Train (the regular season), the Knockout Cup, the Rookie Shield and Survivor.

export type Pos = 'DEF' | 'MID' | 'RUC' | 'FWD';
export type GameKey = 'gtrain' | 'cup' | 'plate' | 'shield' | 'survivor';
export interface SlotRule { key: string; label: string; n: number; fits: Pos[] | 'any'; bench?: boolean }
export interface Rules {
  key: GameKey; name: string; slots: SlotRule[]; captain: boolean; vc: boolean;
  /** one-line summary for under the dropdown */
  summary: string;
  /** extra eligibility (Rookie Shield: 21 and under, or the rookie keeper) */
  eligible?: (p: MdPlayer) => boolean;
}
export interface MdPlayer {
  id: number; name: string; pos: Pos[]; club: string | null; proj: number; age: number | null; rookie: boolean; photo: string | null;
  avg?: number | null; form?: 'up' | 'flat' | 'down' | null; l5?: number | null; keeper?: 'K' | 'RK' | null;
  /** 2026 game log, stat line and career, for the profile pop-up (your own list only) */
  prof?: import('@/lib/mens-round').MProfile;
}
export type MdLineup = { slots: Record<string, number[]>; c?: number | null; vc?: number | null };

const POS4: Pos[] = ['DEF', 'MID', 'RUC', 'FWD'];
const field = (n: Record<Pos, number>): SlotRule[] => POS4.map((p) => ({ key: p, label: { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forwards' }[p], n: n[p], fits: [p] }));

export const RULES: Record<GameKey, Rules> = {
  gtrain: {
    key: 'gtrain', name: 'G-Train', captain: true, vc: true,
    slots: [...field({ DEF: 5, MID: 7, RUC: 1, FWD: 5 }),
      ...POS4.map((p): SlotRule => ({ key: `E${p}`, label: `${p} emergency`, n: 1, fits: [p], bench: true }))],
    summary: '5 DEF, 7 MID, 1 RUC, 5 FWD. Captain doubles, VC covers. One emergency per line: he only comes on if a starter in his line plays under 25% game time.',
  },
  cup: {
    key: 'cup', name: 'Knockout Cup', captain: false, vc: false,
    slots: [...field({ DEF: 4, MID: 6, RUC: 1, FWD: 4 }), { key: 'UTIL', label: 'Utility', n: 1, fits: 'any' }, { key: 'EMG', label: 'Emergencies', n: 4, fits: 'any', bench: true }],
    summary: '4 DEF, 6 MID, 1 RUC, 4 FWD and a utility, plus 4 emergencies. No captains: every player scores once.',
  },
  plate: {
    key: 'plate', name: 'The Plate', captain: false, vc: false,
    slots: [...field({ DEF: 4, MID: 6, RUC: 1, FWD: 4 }), { key: 'UTIL', label: 'Utility', n: 1, fits: 'any' }, { key: 'EMG', label: 'Emergencies', n: 4, fits: 'any', bench: true }],
    summary: 'Cup rules. Highest total over the four Plate rounds wins.',
  },
  shield: {
    key: 'shield', name: 'Rookie Shield', captain: true, vc: false,
    slots: field({ DEF: 3, MID: 4, RUC: 1, FWD: 3 }),
    summary: '3 DEF, 4 MID, 1 RUC, 3 FWD, all 21 or under (or your rookie keeper). Captain doubles.',
    eligible: (p) => p.rookie || (p.age != null && p.age <= 21),
  },
  survivor: {
    key: 'survivor', name: 'Survivor', captain: false, vc: false,
    slots: [{ key: 'PICK', label: 'Your pick', n: 1, fits: 'any' }],
    summary: 'One player. He needs 100. You can only use each player once.',
  },
};

export const fits = (p: MdPlayer, s: SlotRule, r: Rules) => (s.fits === 'any' || p.pos.some((x) => (s.fits as Pos[]).includes(x))) && (!r.eligible || r.eligible(p));
export const onField = (r: Rules) => r.slots.filter((s) => !s.bench).reduce((a, s) => a + s.n, 0);
export const filledField = (r: Rules, l: MdLineup) => r.slots.filter((s) => !s.bench).reduce((a, s) => a + (l.slots[s.key]?.length ?? 0), 0);

/** Projected total: starters' projections, captain doubled. */
export function projTotal(r: Rules, l: MdLineup | undefined, proj: (id: number) => number) {
  if (!l) return 0;
  let t = 0;
  for (const s of r.slots) if (!s.bench) for (const id of l.slots[s.key] ?? []) t += proj(id) * (r.captain && l.c === id ? 2 : 1);
  return Math.round(t);
}

/** Best lineup by projection. Scarce lines first; emergencies are the best left over that fit. */
export function autoFill(r: Rules, squad: MdPlayer[], exclude: Set<number> = new Set()): MdLineup {
  const pool = squad.filter((p) => !exclude.has(p.id) && (!r.eligible || r.eligible(p))).sort((a, b) => b.proj - a.proj);
  const used = new Set<number>(), slots: Record<string, number[]> = {};
  const order = [...r.slots].sort((a, b) => Number(!!a.bench) - Number(!!b.bench) || (a.fits === 'any' ? 1 : 0) - (b.fits === 'any' ? 1 : 0)
    || ['RUC', 'DEF', 'FWD', 'MID'].indexOf(String(a.fits)) - ['RUC', 'DEF', 'FWD', 'MID'].indexOf(String(b.fits)));
  for (const s of order) {
    slots[s.key] = [];
    for (const p of pool) { if (slots[s.key].length >= s.n) break; if (!used.has(p.id) && fits(p, s, r)) { slots[s.key].push(p.id); used.add(p.id); } }
  }
  const starters = r.slots.filter((s) => !s.bench).flatMap((s) => slots[s.key]).sort((a, b) => (pool.find((p) => p.id === b)?.proj ?? 0) - (pool.find((p) => p.id === a)?.proj ?? 0));
  return { slots, c: r.captain ? starters[0] ?? null : null, vc: r.vc ? starters[1] ?? null : null };
}

/** Validate a lineup against the rules and the club's list. Returns a clean copy or an error. */
export function clean(r: Rules, l: MdLineup, squad: Map<number, MdPlayer>): { ok: true; lineup: MdLineup } | { ok: false; error: string } {
  const seen = new Set<number>(), slots: Record<string, number[]> = {};
  for (const s of r.slots) {
    const ids = (l.slots?.[s.key] ?? []).map(Number).filter((x) => Number.isInteger(x));
    if (ids.length > s.n) return { ok: false, error: `Too many in ${s.label}.` };
    for (const id of ids) {
      const p = squad.get(id);
      if (!p) return { ok: false, error: 'Only players on your list can go in.' };
      if (seen.has(id)) return { ok: false, error: `${p.name} is in two spots.` };
      if (!fits(p, s, r)) return { ok: false, error: r.eligible && !r.eligible(p) ? `${p.name} isn’t eligible for the ${r.name}.` : `${p.name} can’t play ${s.label}.` };
      seen.add(id);
    }
    slots[s.key] = ids;
  }
  const starters = new Set(r.slots.filter((s) => !s.bench).flatMap((s) => slots[s.key]));
  const c = r.captain && l.c && starters.has(Number(l.c)) ? Number(l.c) : null;
  const vc = r.vc && l.vc && starters.has(Number(l.vc)) && Number(l.vc) !== c ? Number(l.vc) : null;
  return { ok: true, lineup: { slots, c, vc } };
}

export const ageOn = (birth: string | null, on = new Date(Date.UTC(2027, 2, 1))) => {
  if (!birth) return null;
  const b = new Date(birth); let a = on.getUTCFullYear() - b.getUTCFullYear();
  if (on.getUTCMonth() < b.getUTCMonth() || (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate())) a--;
  return a;
};

/** How a line's spots are laid out on the field: G-Train is 3-2 / 4-3 / 1 / 3-2. */
export function rowsFor(n: number): number[] {
  if (n <= 4) return [n];
  if (n === 5) return [3, 2];
  if (n === 6) return [3, 3];
  if (n === 7) return [4, 3];
  return [Math.ceil(n / 2), Math.floor(n / 2)];
}
