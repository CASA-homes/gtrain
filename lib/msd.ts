// Mid-season draft. After round 10 the ladder is frozen; each club drops 3 players and picks 3 in a short draft.
// Straight order: last on the ladder picks first in every round (no snake). MSD picks are real picks (kind 'msd'):
// they trade on the Trademarket and can be won in side comps. Bonus picks won in comps go at the end of their round.

export const MSD_SEASON = 2027;
export const MSD_ROUNDS = 3;
export const MSD_DROPS = 3;
export const MSD_FREEZE_ROUND = 10;
export type MsdPhase = 'setup' | 'drops' | 'drafting' | 'done';
export const PHASES: { key: MsdPhase; label: string; text: string }[] = [
  { key: 'setup', label: 'Picks out', text: 'Every club holds three MSD picks. Trade them like any other pick.' },
  { key: 'drops', label: 'Drops', text: `Ladder frozen after round ${MSD_FREEZE_ROUND}. Each club names ${MSD_DROPS} players to drop.` },
  { key: 'drafting', label: 'Draft', text: 'Straight reverse-ladder order, three rounds. Dropped players go into the pool.' },
  { key: 'done', label: 'Done', text: 'Lists updated. Picks and drops are in the trade log.' },
];

export interface MsdState { season: number; phase: MsdPhase; freeze_round: number; order_team_ids: number[]; drops_due: string | null; clock_seconds: number; on_clock_since: string | null }
export interface MsdPick { id: number; round: number; overall: number | null; original_team_id: number; owner_team_id: number; is_optional: boolean }
export interface MsdSelection { pick_id: number; team_id: number; player_id: number; player_name: string; made_at: string; applied: boolean }
export interface MsdDrop { team_id: number; player_id: number }

/** Apply "move up N spots" prizes to a ladder order (pick 1 first). */
export function applyBumps(order: number[], bumps: { team: number; spots: number }[]) {
  const out = [...order];
  for (const b of bumps) {
    const i = out.indexOf(b.team);
    if (i < 0) continue;
    const j = Math.max(0, i - b.spots);
    out.splice(i, 1); out.splice(j, 0, b.team);
  }
  return out;
}

/** Overall numbers for every MSD pick: each round in the club order (by the pick's original club), bonus picks last in their round. */
export function numberPicks(picks: MsdPick[], order: number[]): Map<number, number> {
  const out = new Map<number, number>();
  let n = 0;
  for (let r = 1; r <= MSD_ROUNDS; r++) {
    const inRound = picks.filter((p) => p.round === r);
    const regular = inRound.filter((p) => !p.is_optional).sort((a, b) => idx(order, a.original_team_id) - idx(order, b.original_team_id) || a.id - b.id);
    const bonus = inRound.filter((p) => p.is_optional).sort((a, b) => idx(order, a.original_team_id) - idx(order, b.original_team_id) || a.id - b.id);
    for (const p of [...regular, ...bonus]) out.set(p.id, ++n);
  }
  return out;
}
const idx = (order: number[], t: number) => { const i = order.indexOf(t); return i < 0 ? 999 : i; };

/** The pick on the clock: lowest overall without a selection. */
export function onTheClock(picks: MsdPick[], sel: MsdSelection[]) {
  const done = new Set(sel.map((s) => s.pick_id));
  return [...picks].filter((p) => p.overall != null && !done.has(p.id)).sort((a, b) => a.overall! - b.overall!)[0] ?? null;
}
