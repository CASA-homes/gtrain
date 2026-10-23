// Clubhouse verdict tabs: a squad summary (best, most improved, young guns, fallen off) and a draft outlook
// (each upcoming pick, what the club's window says it should chase, and who's likely there).
import { age, type PlayerRow, type Ratings } from '@/lib/ratings';
import { projected2027 } from '@/lib/projection';
import type { Phase } from '@/lib/window';
import crystal from '@/lib/crystal-ball.json';

const NOW = 2026;
const seasonAvg = (p: PlayerRow, y: number) => {
  const h = (p.hist ?? []).find((x) => x[0] === y);
  return h && h[1] >= 5 ? h[2] : null;
};
const cur = (p: PlayerRow) => (p.games ?? 0) >= 5 && p.average != null ? p.average : seasonAvg(p, NOW);
const r1 = (x: number) => Math.round(x);

export interface SummaryItem { label: string; name: string; playerId: number; text: string }

export function squadSummary(players: PlayerRow[], ratings: Map<number, Ratings>): SummaryItem[] {
  const live = players.filter((p) => !p.list_status);
  const out: SummaryItem[] = [];
  const used = new Set<number>();

  const best = [...live].filter((p) => cur(p) != null && (p.games ?? 0) >= 8).sort((a, b) => cur(b)! - cur(a)!)[0];
  if (best) {
    used.add(best.id);
    const prev = seasonAvg(best, NOW - 1);
    out.push({ label: 'Best performer', name: best.name, playerId: best.id,
      text: `${r1(cur(best)!)} average from ${best.games} games${prev ? `, ${cur(best)! >= prev ? 'up' : 'down'} from ${r1(prev)} last year` : ''}. The one you build the side around.` });
  }

  const improved = live.map((p) => ({ p, now: cur(p), prev: seasonAvg(p, NOW - 1) }))
    .filter((x) => x.now != null && x.prev != null && !used.has(x.p.id)).map((x) => ({ ...x, d: x.now! - x.prev! }))
    .sort((a, b) => b.d - a.d)[0];
  if (improved && improved.d >= 5) {
    used.add(improved.p.id);
    out.push({ label: 'Most improved', name: improved.p.name, playerId: improved.p.id,
      text: `Jumped ${r1(improved.d)} points, from ${r1(improved.prev!)} to ${r1(improved.now!)}.` });
  }

  const young = live.filter((p) => (age(p.birth_date) ?? 99) <= 22 && !used.has(p.id))
    .map((p) => ({ p, a: age(p.birth_date)!, now: cur(p), pot: ratings.get(p.id)?.potential ?? 0 }))
    .sort((a, b) => (b.pot - a.pot) || ((b.now ?? 0) - (a.now ?? 0))).slice(0, 3);
  if (young.length) {
    young.forEach((y) => used.add(y.p.id));
    out.push({ label: 'Best young players', name: young.map((y) => y.p.name).join(', '), playerId: young[0].p.id,
      text: young.map((y) => `${y.p.name} (${y.a}${y.now != null ? `, ${r1(y.now)} avg` : ', yet to play'}, ${y.pot} potential stars)`).join('; ') + '.' });
  }

  const fallen = live.map((p) => {
    const now = cur(p), prev = seasonAvg(p, NOW - 1);
    const peak = Math.max(0, ...(p.hist ?? []).filter((h) => h[1] >= 8 && h[0] < NOW).map((h) => h[2]));
    return { p, now, prev, peak, d: now != null ? Math.max(prev != null ? prev - now : 0, (age(p.birth_date) ?? 0) >= 26 ? peak - now - 4 : 0) : 0 };
  }).filter((x) => x.now != null && x.d >= 8 && !used.has(x.p.id)).sort((a, b) => b.d - a.d).slice(0, 2);
  if (fallen.length) {
    out.push({ label: 'Fallen off', name: fallen.map((f) => f.p.name).join(', '), playerId: fallen[0].p.id,
      text: fallen.map((f) => `${f.p.name} ${r1(f.now!)} this year${f.prev != null && f.prev - f.now! >= 8 ? ` after ${r1(f.prev)} in ${NOW - 1}` : ` against a ${r1(f.peak)} peak`}`).join('; ') + '. Worth weighing at keeper time.' });
  }
  return out;
}

// ---------- Draft outlook ----------
interface Prospect { name: string; chance: number; relevant: number; type?: string; position?: string; rank: number }
const ROOKIES = ([...(crystal as { prospects: Prospect[] }).prospects]).sort((a, b) => b.chance - a.chance);
const YOUTH_FIRST: Phase[] = ['Early rebuild', 'Mid rebuild', 'Entering window', 'Leaving window'];

export interface DraftLine { pick: number; round: number; rookie: string | null; rookieType: string | null; vet: string | null; vetProj: number | null; call: 'rookie' | 'vet' }
export interface Outlook { phase: Phase; strategy: string; lines: DraftLine[]; later: number[] }

/**
 * A quick mock of the 2027 redraft: clubs in a rebuild (or on the way out) take the best rookie left, contenders take the
 * best win-now player left. Rookies are the 2026 national draft crop, ranked by the crystal ball; win-now players are
 * G-Train-listed players the keeper simulation leaves unkept, ranked on 2027 projections.
 */
export function draftOutlook(teamId: number, picks: { overall: number; round: number; owner_team_id: number }[], phases: Map<number, Phase>,
  pool: PlayerRow[]): Outlook {
  const order = [...picks].sort((a, b) => a.overall - b.overall);
  const rookies = [...ROOKIES];
  const vets = [...pool].sort((a, b) => projected2027(b) - projected2027(a));
  const mine: DraftLine[] = [];
  for (const pk of order) {
    const youth = YOUTH_FIRST.includes(phases.get(pk.owner_team_id) ?? 'Mid rebuild');
    const takeRookie = rookies.length > 0 && (youth || (vets.length > 0 && rookies[0].chance >= 45));
    if (pk.owner_team_id === teamId && mine.length < 3) {
      mine.push({ pick: pk.overall, round: pk.round, rookie: rookies[0]?.name ?? null, rookieType: rookies[0]?.type ?? null,
        vet: vets[0]?.name ?? null, vetProj: vets[0] ? Math.round(projected2027(vets[0])) : null, call: takeRookie ? 'rookie' : 'vet' });
    }
    if (takeRookie) rookies.shift(); else vets.shift();
  }
  const phase = phases.get(teamId) ?? 'Mid rebuild';
  const first = mine[0]?.pick;
  const strategy =
    phase === 'Prime window' ? `In the window, so picks are for points now.${first && first >= 8 ? ' Late in the order: weigh the best rookie left against a dropped proven scorer who helps this year.' : ' Take the best player who helps win in 2027, rookie or not.'}`
    : phase === 'Entering window' ? 'On the way up: mix it. A rookie who can play in a year or two, or a ready-made scorer to push into the top four.'
    : phase === 'Leaving window' ? 'The window is closing: restock young talent now rather than chase one more year.'
    : phase === 'Mid rebuild' ? 'Mid rebuild: go young and talented. Best rookie available, and let the points come later.'
    : 'Early rebuild: pure upside. Take the highest-ceiling rookie on the board with every early pick.';
  const later = order.filter((p) => p.owner_team_id === teamId).slice(3).map((p) => p.overall);
  return { phase, strategy, lines: mine, later };
}
