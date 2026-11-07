'use server';
// Matchday: save a club's lineup for any game (G-Train week, Cup round, Rookie Shield, Survivor, Plate).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach, getLeague } from '@/lib/data';
import { CUP_SEASON } from '@/lib/cup';
import { COMP_SEASON } from '@/lib/comps';
import { RULES, clean, type GameKey, type MdLineup } from '@/lib/matchday';
import { toMd } from '@/lib/matchday-data';
import { R1_2027 } from '@/lib/mens-round';
import { cupTiedError } from './cup-actions';

type Res = { ok: boolean; error?: string };
const needMigration = (m: string) => (/game_lineups|comp_entries|relation/.test(m) ? 'Matchday needs supabase/migrations/0020_matchday_comps_msd_values.sql run in Supabase first.' : m);

/** Round 1 2027 lock-outs: a player locks at his club's first bounce. Later rounds lock once the live fixture is wired in. */
function lockedClubs(round: number, now = Date.now()) {
  if (round !== 1) return new Set<string>();
  return new Set(R1_2027.filter((g) => Date.parse(g.start) <= now).flatMap((g) => [g.home, g.away]));
}

export async function saveGameLineup(key: GameKey, round: number, lineup: MdLineup): Promise<Res> {
  const me = await getCoach();
  if (!me) return { ok: false, error: 'Only coaches can set a team.' };
  const rules = RULES[key];
  if (!rules || !Number.isInteger(round)) return { ok: false, error: 'Unknown game.' };
  const supabase = await createClient();
  const league = await getLeague();

  if (key === 'shield' || key === 'survivor' || key === 'plate') {
    const e = await supabase.from('comp_entries').select('team_id').eq('season', COMP_SEASON).eq('comp', key).eq('team_id', me.team_id).maybeSingle();
    if (e.error) return { ok: false, error: needMigration(e.error.message) };
    if (!e.data) return { ok: false, error: `You haven’t entered the ${rules.name}.` };
  }

  const list = key === 'survivor'
    ? [...league.players.filter((p) => !p.list_status), ...league.freeAgents]
    : league.players.filter((p) => p.team_id === me.team_id && !p.list_status);
  const squad = new Map(list.map((p) => [p.id, toMd(p)]));
  const res = clean(rules, lineup, squad);
  if (!res.ok) return res;

  // Locked players can't be moved in or out once their game has started.
  const locked = lockedClubs(round);
  if (locked.size && key === 'gtrain') {
    const prev = await supabase.from('game_lineups').select('lineup').eq('season', COMP_SEASON).eq('comp', key).eq('round', round).eq('team_id', me.team_id).maybeSingle();
    const before = new Set(Object.values((prev.data?.lineup as MdLineup | undefined)?.slots ?? {}).flat());
    const after = new Set(Object.values(res.lineup.slots).flat());
    for (const id of new Set([...before, ...after])) {
      const p = squad.get(id);
      if (p?.club && locked.has(p.club) && before.has(id) !== after.has(id)) return { ok: false, error: `${p.name} has already played or is playing: he’s locked.` };
    }
  }

  if (key === 'cup') {
    const tied = await cupTiedError(me.team_id, Object.values(res.lineup.slots).flat());
    if (tied) return { ok: false, error: tied };
  }

  if (key === 'survivor') {
    const pick = res.lineup.slots.PICK?.[0];
    if (pick) {
      const used = await supabase.from('game_lineups').select('round, lineup').eq('season', COMP_SEASON).eq('comp', 'survivor').eq('team_id', me.team_id).neq('round', round);
      if (used.error) return { ok: false, error: needMigration(used.error.message) };
      const hit = (used.data ?? []).find((r) => ((r.lineup as MdLineup).slots?.PICK ?? []).includes(pick));
      if (hit) return { ok: false, error: `You already used ${squad.get(pick)?.name} in round ${hit.round}.` };
    }
  }

  const now = new Date().toISOString();
  const r = key === 'cup'
    ? await supabase.from('cup_lineups').upsert({ season: CUP_SEASON, cup_round: round, team_id: me.team_id, lineup: res.lineup.slots, updated_at: now }, { onConflict: 'season,cup_round,team_id' })
    : await supabase.from('game_lineups').upsert({ season: COMP_SEASON, comp: key, round, team_id: me.team_id, lineup: res.lineup, updated_at: now }, { onConflict: 'season,comp,round,team_id' });
  if (r.error) return { ok: false, error: key === 'cup' && /cup_/.test(r.error.message) ? 'The cup needs supabase/migrations/0019_cup.sql run first.' : needMigration(r.error.message) };
  revalidatePath('/live');
  return { ok: true };
}
