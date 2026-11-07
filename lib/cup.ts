// G-Train Knockout Cup 2027: a separate competition alongside the regular season (think FA Cup next to the Premier League).
// Two groups of five, seeded snake-style off the 2026 ladder. Four group games in AFL rounds 5-8 (clear of the round 11-15
// byes). Five clubs only make two games a round, so each round the spare club in Group A plays the spare club in Group B
// and that game counts on both tables. Top three in each group are safe; 4th plays 5th in a wildcard game (round 9).
// The eight left are drawn at random into quarter-finals (round 16), then semis (round 18) and the final (round 20).
// Cup games use the same AFL round's fantasy scores, but their own lineup: 4 DEF, 6 MID, 1 RUC, 4 FWD + 1 utility,
// 4 emergencies, and no captains. Cup-tied: once a player has played a cup game for one club, he can't play in the cup
// for anyone else that season.

export const CUP_SEASON = 2027;
export const CUP_NAME = 'G-Train Knockout Cup';
export const CONF_NAMES = ['Group A', 'Group B'] as const;
/** AFL rounds the cup is played in. */
export const GROUP_ROUNDS = [5, 6, 7, 8];
export const WILDCARD_ROUND = 9;
export const QF_ROUND = 16;
export const SEMI_ROUND = 18;
export const FINAL_ROUND = 20;
/** Top three in each group go straight to the quarter-finals; 4th and 5th play the wildcard. */
export const SAFE = 3;
export const CUP_SLOTS = { DEF: 4, MID: 6, RUC: 1, FWD: 4, UTIL: 1, EMG: 4 } as const;
export type CupSlot = keyof typeof CUP_SLOTS;
export const CUP_SLOT_ORDER: CupSlot[] = ['DEF', 'MID', 'RUC', 'FWD', 'UTIL', 'EMG'];
export const CUP_SLOT_NAME: Record<CupSlot, string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forwards', UTIL: 'Utility', EMG: 'Emergencies' };
export type CupLineup = Partial<Record<CupSlot, number[]>>;
export const ON_FIELD = 16;
export const STAGE_NAME = { group: 'Group game', wildcard: 'Wildcard', qf: 'Quarter-final', semi: 'Semi-final', final: 'Final' } as const;
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

export type CupStage = keyof typeof STAGE_NAME;
export interface CupMatch { id: string; stage: CupStage; round: number; groupRound?: number; conf?: 0 | 1; cross?: boolean; home: number | null; away: number | null; label?: string }
/** Circle method for five clubs: each round two games and one spare club. We use the first four rounds. */
function circle5(t: number[]): { pairs: [number, number][]; spare: number }[] {
  const slots: (number | null)[] = [...t, null];
  const out: { pairs: [number, number][]; spare: number }[] = [];
  for (let r = 0; r < 5; r++) {
    const pairs: [number, number][] = []; let spare = -1;
    for (let i = 0; i < 3; i++) {
      const x = slots[i], y = slots[5 - i];
      if (x == null) spare = y!; else if (y == null) spare = x; else pairs.push(r % 2 ? [y, x] : [x, y]);
    }
    out.push({ pairs, spare });
    slots.splice(1, 0, slots.pop()!);   // rotate everyone but the first
  }
  return out;
}
export function cupFixture(confs: [number[], number[]]): { matches: CupMatch[]; byes: Record<number, number[]> } {
  const matches: CupMatch[] = [];
  const [A, B] = confs.map(circle5);
  GROUP_ROUNDS.forEach((round, i) => {
    [A, B].forEach((c, ci) => c[i].pairs.forEach(([h, a], j) => matches.push({ id: `g${ci}${i}${j}`, stage: 'group', round, groupRound: i + 1, conf: ci as 0 | 1, home: h, away: a })));
    matches.push({ id: `gx${i}`, stage: 'group', round, groupRound: i + 1, cross: true, home: i % 2 ? B[i].spare : A[i].spare, away: i % 2 ? A[i].spare : B[i].spare });
  });
  matches.push({ id: 'wc1', stage: 'wildcard', round: WILDCARD_ROUND, conf: 0, home: null, away: null, label: 'A4 v A5' });
  matches.push({ id: 'wc2', stage: 'wildcard', round: WILDCARD_ROUND, conf: 1, home: null, away: null, label: 'B4 v B5' });
  for (let i = 1; i <= 4; i++) matches.push({ id: `qf${i}`, stage: 'qf', round: QF_ROUND, home: null, away: null, label: 'Drawn after the wildcards' });
  matches.push({ id: 'sf1', stage: 'semi', round: SEMI_ROUND, home: null, away: null, label: 'Winner QF1 v Winner QF2' });
  matches.push({ id: 'sf2', stage: 'semi', round: SEMI_ROUND, home: null, away: null, label: 'Winner QF3 v Winner QF4' });
  matches.push({ id: 'final', stage: 'final', round: FINAL_ROUND, home: null, away: null, label: 'Winner SF1 v Winner SF2' });
  return { matches, byes: {} };
}

export interface CupResult { match_id: string; home_score: number; away_score: number }
export interface StandRow { team: number; p: number; w: number; d: number; l: number; pf: number; pa: number; pct: number; pts: number }
/** Group table: 4 points a win, 2 a draw; percentage (points for / against) breaks ties. Crossover games count for each side's own group. */
export function standings(conf: number[], matches: CupMatch[], results: CupResult[]): StandRow[] {
  const rows = new Map(conf.map((t) => [t, { team: t, p: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, pct: 0, pts: 0 }]));
  const byId = new Map(results.map((r) => [r.match_id, r]));
  const add = (x: StandRow | undefined, f: number, a: number) => {
    if (!x) return;
    x.p++; x.pf += f; x.pa += a;
    if (f > a) { x.w++; x.pts += 4; } else if (f < a) x.l++; else { x.d++; x.pts += 2; }
  };
  for (const m of matches) {
    const r = byId.get(m.id);
    if (m.stage !== 'group' || !r || m.home == null || m.away == null) continue;
    add(rows.get(m.home), r.home_score, r.away_score);
    add(rows.get(m.away), r.away_score, r.home_score);
  }
  for (const x of rows.values()) x.pct = x.pa ? Math.round((x.pf / x.pa) * 1000) / 10 : 0;
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.pct - x.pct || y.pf - x.pf);
}

/** Seeded shuffle so the quarter-final draw is random but doesn't change on refresh. */
function shuffle<T>(xs: T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
/** Fill in the wildcards, the quarter-final draw, semis and final as each stage is decided. A drawn knockout goes to the home club,
 *  which is the higher group finisher (wildcards) or the better-ranked club across both groups (quarter-finals on). */
export function resolveKnockouts(matches: CupMatch[], confs: [number[], number[]], results: CupResult[]): CupMatch[] {
  const has = (id: string) => results.some((r) => r.match_id === id);
  const groupDone = matches.filter((m) => m.stage === 'group').every((m) => has(m.id));
  const tables = confs.map((c) => standings(c, matches, results));
  const out = matches.map((m) => ({ ...m }));
  const get = (id: string) => out.find((m) => m.id === id)!;
  const winner = (m: CupMatch) => { const r = results.find((x) => x.match_id === m.id); if (!r || m.home == null || m.away == null) return null; return r.home_score >= r.away_score ? m.home : m.away; };
  // rank across both groups: finishing place, then percentage
  const rank = new Map<number, number>();
  tables.flatMap((t) => t.map((row, i) => ({ row, i }))).sort((x, y) => x.i - y.i || y.row.pct - x.row.pct).forEach(({ row }, n) => rank.set(row.team, n));
  const seeded = (a: number | null, b: number | null): [number | null, number | null] => (a != null && b != null && (rank.get(b) ?? 99) < (rank.get(a) ?? 99) ? [b, a] : [a, b]);
  if (groupDone) {
    tables.forEach((t, i) => { const wc = get(`wc${i + 1}`); wc.home = t[3]?.team ?? null; wc.away = t[4]?.team ?? null; });
    const w1 = winner(get('wc1')), w2 = winner(get('wc2'));
    if (w1 != null && w2 != null) {
      const eight = [...tables[0].slice(0, SAFE), ...tables[1].slice(0, SAFE)].map((r) => r.team).concat([w1, w2]);
      const draw = shuffle(eight, CUP_SEASON * 1000 + [...eight].sort((a, b) => a - b).reduce((a, b) => a * 31 + b, 7) % 997);
      for (let i = 0; i < 4; i++) { const q = get(`qf${i + 1}`); [q.home, q.away] = seeded(draw[i * 2], draw[i * 2 + 1]); q.label = undefined; }
    }
  }
  const sf1 = get('sf1'), sf2 = get('sf2'), fin = get('final');
  [sf1.home, sf1.away] = seeded(winner(get('qf1')), winner(get('qf2')));
  [sf2.home, sf2.away] = seeded(winner(get('qf3')), winner(get('qf4')));
  [fin.home, fin.away] = seeded(winner(sf1), winner(sf2));
  return out;
}

/** Cup-tied players: the first club each player played a cup game for (on the field, in a round that has a result). */
export function cupTies(rows: { cup_round: number; team_id: number; lineup: CupLineup }[], matches: CupMatch[], results: CupResult[]): Record<number, number> {
  const done = new Set(results.map((r) => r.match_id));
  const playedRounds = new Set(matches.filter((m) => done.has(m.id)).map((m) => m.round));
  const ties: Record<number, number> = {};
  for (const r of [...rows].sort((a, b) => a.cup_round - b.cup_round)) {
    if (!playedRounds.has(r.cup_round)) continue;
    const played = matches.some((m) => m.round === r.cup_round && done.has(m.id) && (m.home === r.team_id || m.away === r.team_id));
    if (!played) continue;
    for (const s of CUP_SLOT_ORDER) if (s !== 'EMG') for (const id of r.lineup[s] ?? []) ties[id] ??= r.team_id;
  }
  return ties;
}
