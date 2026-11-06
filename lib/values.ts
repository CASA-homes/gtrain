// "Who'd you rather": crowd-sourced player values. Every swipe is a head-to-head; values are Elo ratings replayed from
// the votes, seeded from a model (2027 projection x age curve for dynasty, projection alone for win-now) so the board
// is sensible from the first vote. Picks are in the pool too, so they get real values. Shown on a 0–10,000 scale.
import { projected2027, prospectScore } from '@/lib/projection';
import type { League } from '@/lib/data';
import { ageOn } from '@/lib/matchday';
import { photoUrl } from '@/lib/photos';

export type ValueMode = 'dynasty' | 'now';
export interface VItem {
  id: number;          // player id, or -pick id
  kind: 'player' | 'pick';
  name: string; sub: string; pos: string; club: string | null; age: number | null; avg: number | null; proj: number;
  photo: string | null; owner: number | null;
  seed: Record<ValueMode, number>;   // model Elo
}
export interface Vote { voter_id: number; mode: ValueMode; a_id: number; b_id: number; winner: number | null; created_at?: string }

const ageCurve = (a: number | null) => (a == null ? 1 : Math.max(0.55, Math.min(1.3, 1.3 - 0.05 * (a - 20) - (a > 28 ? 0.04 * (a - 28) : 0))));
const seedElo = (score: number) => 1500 + (score - 80) * 8;
export const toValue = (elo: number) => Math.round(10000 / (1 + Math.exp(-(elo - 1500) / 170)));

export function buildItems(league: League): VItem[] {
  const club = (id: number) => league.teams.find((t) => t.id === id)?.short_code ?? '?';
  const players = [...league.players.filter((p) => !p.list_status), ...league.freeAgents.filter((p) => projected2027(p) >= 65)].map((p): VItem => {
    const proj = Math.round(projected2027(p) || 0), age = ageOn(p.birth_date);
    return {
      id: p.id, kind: 'player', name: p.full_name ?? p.name, sub: `${p.positions.join('/')}${p.afl_club ? ` · ${p.afl_club}` : ''}${age != null ? ` · ${age}` : ''}`,
      pos: p.positions.join('/'), club: p.afl_club, age, avg: p.average != null ? Math.round(p.average) : null, proj, photo: photoUrl(p), owner: p.team_id || null,
      seed: { dynasty: seedElo(proj * ageCurve(age)), now: seedElo(proj) },
    };
  });
  const picks = league.picks.filter((p) => p.year >= 2027).map((p): VItem => {
    const ov = p.overall ?? (p.round - 1) * 10 + 5;
    const fut = prospectScore(ov) * (p.year === 2028 ? 0.95 : 1);
    return {
      id: -p.id, kind: 'pick', name: `${p.year} pick ${p.overall ? `#${p.overall}` : `R${p.round}`}`, sub: `${p.overall ? `Round ${p.round}` : 'Order TBC'} · ${club(p.owner_team_id)}${p.original_team_id !== p.owner_team_id ? ` (via ${club(p.original_team_id)})` : ''}`,
      pos: 'PICK', club: null, age: null, avg: null, proj: 0, photo: null, owner: p.owner_team_id,
      seed: { dynasty: seedElo(fut), now: seedElo(Math.min(60, fut * 0.45)) },
    };
  }).filter((x) => x.seed.dynasty > seedElo(45));
  return [...players, ...picks];
}

/** Replay votes oldest first. Votes on your own players count half. */
export function rate(items: VItem[], votes: Vote[], mode: ValueMode) {
  const elo = new Map(items.map((i) => [i.id, i.seed[mode]]));
  const owner = new Map(items.map((i) => [i.id, i.owner]));
  const count = new Map<number, number>();
  for (const v of votes) {
    if (v.mode !== mode) continue;
    const ra = elo.get(v.a_id), rb = elo.get(v.b_id);
    if (ra == null || rb == null) continue;
    const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const sa = v.winner == null ? 0.5 : v.winner === v.a_id ? 1 : 0;
    const k = 28 * (owner.get(v.a_id) === v.voter_id || owner.get(v.b_id) === v.voter_id ? 0.5 : 1);
    elo.set(v.a_id, ra + k * (sa - ea)); elo.set(v.b_id, rb + k * ((1 - sa) - (1 - ea)));
    count.set(v.a_id, (count.get(v.a_id) ?? 0) + 1); count.set(v.b_id, (count.get(v.b_id) ?? 0) + 1);
  }
  return { elo, count };
}

export interface Valued { id: number; value: number; model: number; votes: number }
export function valuesFor(items: VItem[], votes: Vote[], mode: ValueMode): Valued[] {
  const { elo, count } = rate(items, votes, mode);
  return items.map((i) => ({ id: i.id, value: toValue(elo.get(i.id)!), model: toValue(i.seed[mode]), votes: count.get(i.id) ?? 0 }))
    .sort((a, b) => b.value - a.value);
}
