// A league's own scoring, from the rules the commish sets in League settings (lib/league-rules):
//   pointsWith   fantasy points from a raw stat line using the league's formula
//   teamScore    a club's total for a round: emergencies covering starters (TOG threshold, dual positions, utility,
//                loophole), captain doubling, and the vice-captain taking the double when the captain doesn't count.
// Pure: no server imports, so the live board and the server can both use it.
import type { LeagueRules } from '@/lib/league-rules';
import type { MdLineup, Pos, Rules } from '@/lib/matchday';

export type Scoring = LeagueRules['scoring'];
export type TeamRules = LeagueRules['team'];
/** What matchday needs from the league's settings. */
export interface MdLeague { team: TeamRules; scoring: Scoring }

export type StatLine = { k: number; hb: number; m: number; t: number; ho: number; g: number; b: number; ff: number; fa: number };
const STAT: Record<string, keyof StatLine> = { Kick: 'k', Handball: 'hb', Mark: 'm', Tackle: 't', Hitout: 'ho', Goal: 'g', Behind: 'b', 'Free for': 'ff', 'Free against': 'fa' };
export const STANDARD_FORMULA: Record<string, number> = { Kick: 3, Handball: 2, Mark: 3, Tackle: 4, Hitout: 1, Goal: 6, Behind: 1, 'Free for': 1, 'Free against': -3 };

/** Fantasy points for one stat line under a formula (defaults to standard AFL Fantasy). */
export function pointsWith(formula: Record<string, number> | null | undefined, s: StatLine): number {
  const f = { ...STANDARD_FORMULA, ...(formula ?? {}) };
  return Object.entries(STAT).reduce((t, [k, key]) => t + (f[k] ?? 0) * (s[key] ?? 0), 0);
}
export const isStandardFormula = (formula: Record<string, number> | null | undefined) =>
  Object.keys(STANDARD_FORMULA).every((k) => (formula?.[k] ?? STANDARD_FORMULA[k]) === STANDARD_FORMULA[k]);

/** One player's round: his points, time on ground (null = not known yet) and whether he played at all. */
export interface PlayerGame { pts: number; tog: number | null; played: boolean }
export interface ScoredRow {
  id: number; slot: string; bench: boolean; pts: number; mult: number; counted: boolean;
  role?: 'C' | 'VC'; coveredBy?: number; cameOnFor?: number;
}

/**
 * A club's total. Starters count unless they didn't play, or played under the TOG threshold and an emergency who can
 * cover him scored more. Emergencies cover their own line (any of their positions with dual cover); the utility is the
 * last-chance cover for the positions he holds. Empty field spots are only filled with the loophole on. Captain ×2;
 * if the captain doesn't count, or plays under the captain TOG rule, the VC takes the ×2 and the captain counts as normal.
 */
export function teamScore(r: Rules, s: Scoring, l: MdLineup, game: (id: number) => PlayerGame | null, posOf: (id: number) => Pos[]): { total: number; rows: ScoredRow[] } {
  const rows: ScoredRow[] = [];
  const g = (id: number): PlayerGame => game(id) ?? { pts: 0, tog: null, played: false };
  for (const slot of r.slots) for (const id of (l.slots[slot.key] ?? []).slice(0, slot.n)) {
    rows.push({ id, slot: slot.key, bench: !!slot.bench, pts: g(id).pts, mult: 1, counted: !slot.bench });
  }
  const field = rows.filter((x) => !x.bench);
  const bench = rows.filter((x) => x.bench);
  // Which line does an emergency cover? A line emergency covers his line; with dual cover, any line he can play.
  const lineOf = (slot: string): Pos | null => (['DEF', 'MID', 'RUC', 'FWD'] as Pos[]).find((p) => slot === p || slot === `E${p}`) ?? null;
  const covers = (e: ScoredRow, line: Pos) => {
    const own = lineOf(e.slot);
    const pos = posOf(e.id);
    if (e.slot === 'UTIL') return pos.includes(line);
    if (own && !s.dual_cover) return own === line;
    if (own && own === line) return true;
    return s.dual_cover ? pos.includes(line) : (pos[0] === line);
  };
  const under = (x: ScoredRow) => { const p = g(x.id); return !p.played || (p.tog != null && p.tog < s.tog); };
  const used = new Set<number>();
  const take = (line: Pos, beat: number | null, utilOnly: boolean) => {
    const pool = bench.filter((e) => !used.has(e.id) && g(e.id).played && (utilOnly ? e.slot === 'UTIL' : e.slot !== 'UTIL') && covers(e, line) && (beat == null || e.pts > beat));
    return pool.sort((a, b) => b.pts - a.pts)[0] ?? null;
  };
  // Lowest-scoring starters get first pick of the emergencies.
  const needs = field.filter(under).sort((a, b) => a.pts - b.pts);
  for (const x of needs) {
    const line = lineOf(x.slot); if (!line) continue;
    const dnp = !g(x.id).played;
    const e = take(line, dnp ? null : x.pts, false) ?? take(line, dnp ? null : x.pts, true);
    if (e) { used.add(e.id); e.counted = true; e.cameOnFor = x.id; x.counted = false; x.coveredBy = e.id; }
  }
  // Loophole: emergencies filling field spots nobody was picked for.
  if (s.loophole) for (const slot of r.slots.filter((x) => !x.bench)) {
    const line = lineOf(slot.key); if (!line) continue;
    for (let gap = slot.n - (l.slots[slot.key]?.length ?? 0); gap > 0; gap--) {
      const e = take(line, null, false) ?? take(line, null, true);
      if (!e) break;
      used.add(e.id); e.counted = true;
    }
  }
  // Captains.
  if (r.captain && s.captain) {
    const c = rows.find((x) => x.id === l.c && !x.bench);
    const vc = r.vc && s.vc ? rows.find((x) => x.id === l.vc && !x.bench) : undefined;
    if (c) c.role = 'C';
    if (vc) vc.role = 'VC';
    const cg = c ? g(c.id) : null;
    const cOk = !!c && c.counted && !!cg?.played && (cg.tog == null || cg.tog >= s.captain_tog);
    if (cOk) c!.mult = 2;
    else if (vc && vc.counted) vc.mult = 2;
  }
  const total = rows.filter((x) => x.counted).reduce((t, x) => t + x.pts * x.mult, 0);
  return { total: Math.round(total), rows };
}

/** Preseason: before the season's first bounce, or once the next preseason opens. Scoring formula changes only then. */
export function inPreseason(firstBounce: string | null, preseasonOpen: string | null, now = Date.now()) {
  const start = firstBounce ? Date.parse(firstBounce) : NaN;
  if (!Number.isFinite(start) || now < start) return true;
  const open = preseasonOpen ? Date.parse(preseasonOpen) : NaN;
  return Number.isFinite(open) && open > start && now >= open;
}
