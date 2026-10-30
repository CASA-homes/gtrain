// Trade planner: what a trade does to each team, judged by that team's window.
// Pure functions so the whole thing runs in the browser; nothing is saved.
//
// For each team we measure two things before and after:
//   now    = 2027 position-valid starting 18 from projected 2027 averages (same as the Rankings 2027 outlook)
//   future = its best six players aged 23 or under (future-build scores) plus its best two 2027 picks as prospects
// A team's window sets how much it cares about each: a contender weighs now, a rebuild weighs future.
import { lineTotals, LINE_WEIGHT } from '@/lib/projection';
import type { Line } from '@/lib/ratings';

export interface PAsset {
  key: string;            // player:ID or pick:ID
  kind: 'player' | 'pick';
  id: number;
  teamId: number;
  label: string;
  sub: string;
  positions: Line[];
  age: number | null;
  now: number;            // projected 2027 average (players), 0 for picks
  fut: number;            // future-build score (players) or prospect score (2027 picks)
  pts: number;            // market points, the neutral scale used across the site
  club: string | null;
  photo: string | null;
  dfs: string | null;
  young: boolean;         // counts toward the future core (23 or under)
}
export interface PTeam { id: number; name: string; short: string; logo?: string | null; projRank: number; futRank: number; status: string; window: string; wNow: number; blurb: string }

const FUTURE_CORE = 6;
const FUTURE_PICKS = 2;

export const WINDOWS: { window: string; wNow: number; blurb: string }[] = [
  { window: 'Win now', wNow: 0.8, blurb: 'In the window: every point this year matters more than prospects.' },
  { window: 'Contender', wNow: 0.68, blurb: 'Contending, but won’t give the future away.' },
  { window: 'Entering contention', wNow: 0.52, blurb: 'Young core in place and about to push: wants a balance, not more kids.' },
  { window: 'Middle', wNow: 0.5, blurb: 'Values now and later about equally.' },
  { window: 'Rebuild', wNow: 0.3, blurb: 'Building through youth and picks; 2027 points matter less.' },
];

/** How a team values now v later, from its 2027 projection rank and its future-build rank (1 = best of 10). */
export function windowFor(projRank: number, futRank: number): { window: string; wNow: number; blurb: string } {
  if (projRank <= 3 && futRank >= 6) return { window: 'Win now', wNow: 0.8, blurb: 'Top-3 2027 side with a thin young core: every point this year matters more than prospects.' };
  if (projRank <= 3) return { window: 'Contender', wNow: 0.68, blurb: 'Top-3 2027 side with youth coming through: mostly about now, but won’t give the future away.' };
  if (projRank <= 6 && futRank <= 4) return { window: 'Entering contention', wNow: 0.52, blurb: 'Young core is in place and the 2027 side is close: wants a balance, not more kids.' };
  if (projRank >= 7 && futRank <= 4) return { window: 'Rebuild', wNow: 0.3, blurb: 'Not winning in 2027; building through youth and picks.' };
  if (projRank >= 8) return { window: 'Rebuild', wNow: 0.35, blurb: 'Bottom of the 2027 projections: future value matters most.' };
  return { window: 'Middle', wNow: 0.5, blurb: 'Middle of the pack both ways: values now and later about equally.' };
}

export function strength(assets: PAsset[]) {
  const players = assets.filter((a) => a.kind === 'player');
  const lines = lineTotals(players.map((p) => ({ id: p.id, positions: p.positions, score: p.now })));
  const now = (Object.keys(lines) as Line[]).reduce((s, l) => s + lines[l] * LINE_WEIGHT[l], 0);
  const core = players.filter((p) => p.young).map((p) => p.fut).sort((a, b) => b - a).slice(0, FUTURE_CORE);
  const picks = assets.filter((a) => a.kind === 'pick').map((a) => a.fut).sort((a, b) => b - a).slice(0, FUTURE_PICKS);
  const future = [...core, ...picks].reduce((s, x) => s + x, 0);
  return { now, future, lines };
}

export interface SideResult {
  team: PTeam;
  dNow: number;           // change in 2027 starting-18 points per round
  dFuture: number;        // change in future-core score
  score: number;          // window-weighted change
  ptsIn: number; ptsOut: number;
  lines: Record<Line, number>;   // change per line in the 2027 starting 18
  notes: string[];
}

export function evaluate(team: PTeam, roster: PAsset[], gives: PAsset[], gets: PAsset[]): SideResult {
  const out = new Set(gives.map((a) => a.key));
  const before = strength(roster);
  const after = strength([...roster.filter((a) => !out.has(a.key)), ...gets.map((a) => ({ ...a, teamId: team.id }))]);
  const dNow = Math.round(after.now - before.now);
  const dFuture = Math.round(after.future - before.future);
  const score = Math.round(team.wNow * dNow + (1 - team.wNow) * dFuture);
  const lines = Object.fromEntries((Object.keys(before.lines) as Line[]).map((l) => [l, Math.round(after.lines[l] - before.lines[l])])) as Record<Line, number>;
  const notes: string[] = [];
  const youngIn = gets.filter((a) => a.kind === 'pick' || (a.age ?? 30) <= 22).length;
  const vetsIn = gets.filter((a) => a.kind === 'player' && (a.age ?? 0) >= 27).length;
  if (team.window === 'Entering contention' && youngIn >= 2 && dNow <= 0) notes.push('Gets more kids and picks without getting better in 2027: not what a side about to contend needs.');
  if ((team.window === 'Win now' || team.window === 'Contender') && dNow < -8) notes.push(`Gets ${Math.abs(dNow)} points a round worse in 2027, which hurts a side in its window.`);
  if (team.window === 'Rebuild' && vetsIn > 0 && dFuture <= 0) notes.push('Takes on older players without adding to the young core: little use in a rebuild.');
  if (dNow === 0 && gets.some((a) => a.kind === 'player' && a.now > 0)) notes.push('What comes in doesn’t crack their 2027 best 18.');
  const bestLine = (Object.keys(lines) as Line[]).sort((a, b) => lines[b] - lines[a])[0];
  if (lines[bestLine] >= 8) notes.push(`Biggest lift on the ${bestLine} line (+${lines[bestLine]} a round).`);
  const worstLine = (Object.keys(lines) as Line[]).sort((a, b) => lines[a] - lines[b])[0];
  if (lines[worstLine] <= -8) notes.push(`Leaves a hole on the ${worstLine} line (${lines[worstLine]} a round).`);
  return { team, dNow, dFuture, score, ptsIn: gets.reduce((s, a) => s + a.pts, 0), ptsOut: gives.reduce((s, a) => s + a.pts, 0), lines, notes };
}

export function verdict(meR: SideResult, themR: SideResult): { tone: 'good' | 'ok' | 'bad'; text: string } {
  // Within 3 either way is noise: call it even
  const me = { score: Math.abs(meR.score) <= 3 ? 0 : meR.score }, them = { score: Math.abs(themR.score) <= 3 ? 0 : themR.score };
  const both = me.score >= 0 && them.score >= 0;
  const gap = me.score - them.score;
  if (both && Math.abs(gap) <= 12) return { tone: 'good', text: 'Works for both sides. A fair deal each coach can sell.' };
  if (both) return { tone: 'good', text: gap > 0 ? 'Both teams improve, but you do better out of it. They may push for a bit more.' : 'Both teams improve, and they do better out of it. You could ask for a little more.' };
  if (me.score >= 0 && them.score < 0) return { tone: them.score > -15 ? 'ok' : 'bad', text: them.score > -15 ? 'Close. They come out slightly behind for their window: a small sweetener should get it done.' : 'They’d probably say no: it doesn’t suit where they are. Try a suggestion below.' };
  if (me.score < 0 && them.score >= 0) return { tone: me.score > -15 ? 'ok' : 'bad', text: me.score > -15 ? 'You’re slightly overpaying for your window. Try trimming what you give.' : 'You’re overpaying for what you need right now.' };
  return { tone: 'bad', text: 'Neither side is better off. The pieces don’t fit either team’s window.' };
}

/**
 * Fair packages for a target: combinations of up to three of my assets (players outside the target list and picks)
 * that leave both teams better off for their windows, best balance first.
 */
export function suggest(meTeam: PTeam, themTeam: PTeam, myRoster: PAsset[], theirRoster: PAsset[], gets: PAsset[], fixedGives: PAsset[] = []): {
  gives: PAsset[]; me: SideResult; them: SideResult }[] {
  const fixed = new Set(fixedGives.map((a) => a.key));
  // Candidates: what they'd value most and I'd miss least, by window-weighted single-asset swaps.
  const cand = myRoster.filter((a) => !fixed.has(a.key) && (a.kind === 'pick' || a.now > 0 || a.fut > 0)).map((a) => {
    const themVal = themTeam.wNow * a.now / 18 + (1 - themTeam.wNow) * (a.young || a.kind === 'pick' ? a.fut : 0) / 6;
    const meVal = meTeam.wNow * a.now / 18 + (1 - meTeam.wNow) * (a.young || a.kind === 'pick' ? a.fut : 0) / 6;
    return { a, edge: themVal - meVal * 0.8, themVal };
  }).sort((x, y) => y.edge - x.edge || y.themVal - x.themVal).slice(0, 18).map((x) => x.a);
  const combos: PAsset[][] = [];
  for (let i = 0; i < cand.length; i++) {
    combos.push([cand[i]]);
    for (let j = i + 1; j < cand.length; j++) {
      combos.push([cand[i], cand[j]]);
      for (let k = j + 1; k < Math.min(cand.length, 12); k++) combos.push([cand[i], cand[j], cand[k]]);
    }
  }
  const res = combos.map((c) => {
    const gives = [...fixedGives, ...c];
    const me = evaluate(meTeam, myRoster, gives, gets);
    const them = evaluate(themTeam, theirRoster, gets, gives);
    return { gives, me, them, fit: Math.min(me.score, them.score) - Math.abs(me.score - them.score) * 0.25 - c.length * 2 };
  }).filter((r) => r.me.score >= -5 && r.them.score >= -5).sort((a, b) => b.fit - a.fit);
  // Keep variety: don't show five versions of the same main piece
  const out: typeof res = [];
  const seen = new Set<string>();
  const uses = new Map<string, number>();
  for (const r of res) {
    if (r.gives.slice(fixedGives.length).some((a) => a.kind === 'player' && (uses.get(a.key) ?? 0) >= 2)) continue;
    // one package per main piece, so the options are genuinely different
    const extra = r.gives.slice(fixedGives.length);
    const people = extra.filter((a) => a.kind === 'player').map((a) => a.key).sort().join('+');
    const lead = people || extra.map((a) => a.key).sort().join('+');
    if (seen.has(lead)) continue;
    seen.add(lead);
    for (const a of r.gives) uses.set(a.key, (uses.get(a.key) ?? 0) + 1);
    out.push(r);
    if (out.length >= 5) break;
  }
  return out.map(({ gives, me, them }) => ({ gives, me, them }));
}
