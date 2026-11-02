// G-Train Knockout Cup 2027: a separate competition alongside the regular season (think FA Cup next to the Premier League).
// Two conferences of five, seeded snake-style off the 2026 ladder. Each club plays the other four in its conference once
// (five group rounds, so each club sits out one), top two from each conference go to cross-over semi-finals, then a final
// the week before the regular-season grand final. Cup games use the same AFL round's fantasy scores, but their own lineup:
// 4 DEF, 6 MID, 1 RUC, 4 FWD + 1 utility, 4 emergencies, and no captains.

export const CUP_SEASON = 2027;
export const CUP_NAME = 'G-Train Knockout Cup';
export const CONF_NAMES = ['Conference A', 'Conference B'] as const;
/** AFL rounds the cup is played in. Group rounds are a fortnight apart and clear of the mid-season byes; the final is the week before the grand final (round 24). */
export const GROUP_ROUNDS = [3, 5, 7, 9, 11];
export const SEMI_ROUND = 21;
export const FINAL_ROUND = 23;
export const CUP_SLOTS = { DEF: 4, MID: 6, RUC: 1, FWD: 4, UTIL: 1, EMG: 4 } as const;
export type CupSlot = keyof typeof CUP_SLOTS;
export const CUP_SLOT_ORDER: CupSlot[] = ['DEF', 'MID', 'RUC', 'FWD', 'UTIL', 'EMG'];
export const CUP_SLOT_NAME: Record<CupSlot, string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forwards', UTIL: 'Utility', EMG: 'Emergencies' };
export type CupLineup = Partial<Record<CupSlot, number[]>>;
export const ON_FIELD = 16;
/** Round 1 2027 starts Wed 17 March; later rounds are about a week apart (a guide only until the full fixture is loaded). */
export function roundWeek(round: number) {
  const d = new Date(Date.UTC(2027, 2, 17 + (round - 1) * 7 + (round > 12 ? 7 : 0)));
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Can a player with these positions fill this slot? Utility and emergencies take anyone. */
export const fitsSlot = (pos: string[], slot: CupSlot) => slot === 'UTIL' || slot === 'EMG' || pos.includes(slot);

/** Snake seeding off the 2026 ladder: A gets 1, 4, 5, 8, 9; B gets 2, 3, 6, 7, 10. */
export function conferences(ladderOrder: number[]): [number[], number[]] {
  const a: number[] = [], b: number[] = [];
  ladderOrder.forEach((t, i) => { const r = Math.floor(i / 2), first = i % 2 === 0; ((r % 2 === 0) === first ? a : b).push(t); });
  return [a, b];
}

export interface CupMatch { id: string; stage: 'group' | 'semi' | 'final'; round: number; groupRound?: number; conf?: 0 | 1; home: number | null; away: number | null; label?: string }
/** Round robin for five clubs (circle method with a bye): five rounds, two games each, one club resting. */
function roundRobin5(t: number[]): { pairs: [number, number][]; bye: number }[] {
  const slots: (number | null)[] = [...t, null];
  const out: { pairs: [number, number][]; bye: number }[] = [];
  for (let r = 0; r < 5; r++) {
    const pairs: [number, number][] = []; let bye = -1;
    for (let i = 0; i < 3; i++) {
      const x = slots[i], y = slots[5 - i];
      if (x == null) bye = y!; else if (y == null) bye = x; else pairs.push(r % 2 ? [y, x] : [x, y]);
    }
    out.push({ pairs, bye });
    slots.splice(1, 0, slots.pop()!);   // rotate everyone but the first
  }
  return out;
}
export function cupFixture(confs: [number[], number[]]): { matches: CupMatch[]; byes: Record<number, number[]> } {
  const matches: CupMatch[] = [], byes: Record<number, number[]> = {};
  confs.forEach((c, ci) => roundRobin5(c).forEach((rd, i) => {
    const round = GROUP_ROUNDS[i];
    (byes[round] ??= []).push(rd.bye);
    rd.pairs.forEach(([h, a], j) => matches.push({ id: `g${ci}${i}${j}`, stage: 'group', round, groupRound: i + 1, conf: ci as 0 | 1, home: h, away: a }));
  }));
  matches.push({ id: 'sf1', stage: 'semi', round: SEMI_ROUND, home: null, away: null, label: 'A1 v B2' });
  matches.push({ id: 'sf2', stage: 'semi', round: SEMI_ROUND, home: null, away: null, label: 'B1 v A2' });
  matches.push({ id: 'final', stage: 'final', round: FINAL_ROUND, home: null, away: null, label: 'Winner SF1 v Winner SF2' });
  return { matches, byes };
}

export interface CupResult { match_id: string; home_score: number; away_score: number }
export interface StandRow { team: number; p: number; w: number; d: number; l: number; pf: number; pa: number; pct: number; pts: number }
/** Conference table: 4 points a win, 2 a draw; percentage (points for / against) breaks ties. */
export function standings(conf: number[], matches: CupMatch[], results: CupResult[]): StandRow[] {
  const rows = new Map(conf.map((t) => [t, { team: t, p: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, pct: 0, pts: 0 }]));
  const byId = new Map(results.map((r) => [r.match_id, r]));
  for (const m of matches) {
    const r = byId.get(m.id);
    if (m.stage !== 'group' || !r || m.home == null || m.away == null) continue;
    const h = rows.get(m.home), a = rows.get(m.away);
    if (!h || !a) continue;
    h.p++; a.p++; h.pf += r.home_score; h.pa += r.away_score; a.pf += r.away_score; a.pa += r.home_score;
    if (r.home_score > r.away_score) { h.w++; a.l++; h.pts += 4; } else if (r.home_score < r.away_score) { a.w++; h.l++; a.pts += 4; } else { h.d++; a.d++; h.pts += 2; a.pts += 2; }
  }
  for (const x of rows.values()) x.pct = x.pa ? Math.round((x.pf / x.pa) * 1000) / 10 : 0;
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.pct - x.pct || y.pf - x.pf);
}
/** Fill in the semis and final once the group stage (and semis) are decided. */
export function resolveKnockouts(matches: CupMatch[], confs: [number[], number[]], results: CupResult[]): CupMatch[] {
  const groupDone = matches.filter((m) => m.stage === 'group').every((m) => results.some((r) => r.match_id === m.id));
  const [A, B] = confs.map((c) => standings(c, matches, results));
  const winner = (id: string, m?: CupMatch) => { const r = results.find((x) => x.match_id === id); if (!r || !m || m.home == null || m.away == null) return null; return r.home_score >= r.away_score ? m.home : m.away; };
  const out = matches.map((m) => ({ ...m }));
  const sf1 = out.find((m) => m.id === 'sf1')!, sf2 = out.find((m) => m.id === 'sf2')!, fin = out.find((m) => m.id === 'final')!;
  if (groupDone) { sf1.home = A[0].team; sf1.away = B[1].team; sf2.home = B[0].team; sf2.away = A[1].team; }
  fin.home = winner('sf1', sf1); fin.away = winner('sf2', sf2);
  return out;
}
