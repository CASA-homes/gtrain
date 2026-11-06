'use server';
// Mid-season draft: picks, the order, drops, selections, and applying it all to the lists.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach, getLeague } from '@/lib/data';
import { MSD_DROPS, MSD_ROUNDS, MSD_SEASON, applyBumps, numberPicks, onTheClock, type MsdDrop, type MsdPhase, type MsdPick, type MsdSelection, type MsdState } from '@/lib/msd';

type Res = { ok: boolean; error?: string };
const MIG = 'The mid-season draft needs supabase/migrations/0020_matchday_comps_msd_values.sql run in Supabase first.';
const err = (m: string): Res => ({ ok: false, error: /msd_|kind|relation|does not exist/.test(m) ? MIG : m });
const done = (): Res => { revalidatePath('/draft/msd'); revalidatePath('/draft'); return { ok: true }; };

export interface MsdData { ready: boolean; state: MsdState; picks: MsdPick[]; drops: MsdDrop[]; selections: MsdSelection[] }
const blank: MsdState = { season: MSD_SEASON, phase: 'setup', freeze_round: 10, order_team_ids: [], drops_due: null, clock_seconds: 0, on_clock_since: null };

export async function loadMsd(): Promise<MsdData> {
  const supabase = await createClient();
  const [s, p, d, x] = await Promise.all([
    supabase.from('msd_state').select('*').eq('season', MSD_SEASON).maybeSingle(),
    supabase.from('picks').select('id, round, overall, original_team_id, owner_team_id, is_optional').eq('year', MSD_SEASON).eq('kind', 'msd').order('round').order('id'),
    supabase.from('msd_drops').select('team_id, player_id').eq('season', MSD_SEASON),
    supabase.from('msd_selections').select('pick_id, team_id, player_id, player_name, made_at, applied').eq('season', MSD_SEASON),
  ]);
  if (s.error || p.error || d.error || x.error) return { ready: false, state: blank, picks: [], drops: [], selections: [] };
  return { ready: true, state: (s.data as MsdState | null) ?? blank, picks: (p.data ?? []) as MsdPick[], drops: (d.data ?? []) as MsdDrop[], selections: (x.data ?? []) as MsdSelection[] };
}

async function commish() { const me = await getCoach(); return me?.is_commish ? me : null; }

/** Commish: give every club its three MSD picks (skips clubs that already have them). */
export async function createMsdPicks(): Promise<Res> {
  if (!(await commish())) return { ok: false, error: 'Commish only.' };
  const supabase = await createClient();
  const { teams } = await getLeague();
  const cur = await loadMsd();
  if (!cur.ready) return { ok: false, error: MIG };
  const rows = teams.flatMap((t) => Array.from({ length: MSD_ROUNDS }, (_, i) => i + 1)
    .filter((r) => !cur.picks.some((p) => p.original_team_id === t.id && p.round === r && !p.is_optional))
    .map((r) => ({ year: MSD_SEASON, round: r, overall: null, original_team_id: t.id, owner_team_id: t.id, is_optional: false, kind: 'msd' })));
  if (rows.length) { const r = await supabase.from('picks').insert(rows); if (r.error) return err(r.error.message); }
  const s = await supabase.from('msd_state').upsert({ season: MSD_SEASON, updated_at: new Date().toISOString() }, { onConflict: 'season' });
  return s.error ? err(s.error.message) : done();
}

/** Commish: save the order (pick 1 first), apply any "move up" prizes, and number every MSD pick. */
export async function saveMsdOrder(order: number[]): Promise<Res> {
  if (!(await commish())) return { ok: false, error: 'Commish only.' };
  const supabase = await createClient();
  const cur = await loadMsd();
  if (!cur.ready) return { ok: false, error: MIG };
  if (cur.state.phase === 'drafting' && cur.selections.length) return { ok: false, error: 'The draft has started: undo the picks first.' };
  const bumpsQ = await supabase.from('comp_prizes').select('winner_id, amount').eq('season', MSD_SEASON).eq('kind', 'msd_bump').eq('status', 'transferred');
  const final = applyBumps(order, (bumpsQ.data ?? []).filter((b) => b.winner_id).map((b) => ({ team: b.winner_id as number, spots: b.amount ?? 1 })));
  const nums = numberPicks(cur.picks, final);
  const s = await supabase.from('msd_state').upsert({ season: MSD_SEASON, order_team_ids: final, updated_at: new Date().toISOString() }, { onConflict: 'season' });
  if (s.error) return err(s.error.message);
  const res = await Promise.all([...nums].map(([id, overall]) => supabase.from('picks').update({ overall }).eq('id', id)));
  const bad = res.find((r) => r.error);
  return bad?.error ? err(bad.error.message) : done();
}

export async function setMsdPhase(phase: MsdPhase, dropsDue?: string | null, clockSeconds?: number): Promise<Res> {
  if (!(await commish())) return { ok: false, error: 'Commish only.' };
  const supabase = await createClient();
  const cur = await loadMsd();
  if (phase === 'drafting' && cur.picks.some((p) => p.overall == null)) return { ok: false, error: 'Set the order first so every pick has a number.' };
  const patch: Record<string, unknown> = { season: MSD_SEASON, phase, updated_at: new Date().toISOString() };
  if (dropsDue !== undefined) patch.drops_due = dropsDue;
  if (clockSeconds !== undefined) patch.clock_seconds = clockSeconds;
  if (phase === 'drafting') patch.on_clock_since = new Date().toISOString();
  const r = await supabase.from('msd_state').upsert(patch, { onConflict: 'season' });
  return r.error ? err(r.error.message) : done();
}

/** Coaches: mark (or unmark) one of their players to drop. Exactly three by the deadline. */
export async function toggleDrop(playerId: number): Promise<Res> {
  const me = await getCoach();
  if (!me) return { ok: false, error: 'Only coaches can drop players.' };
  const cur = await loadMsd();
  if (!cur.ready) return { ok: false, error: MIG };
  if (cur.state.phase !== 'drops' && !(me.is_commish && cur.state.phase === 'setup')) return { ok: false, error: cur.state.phase === 'setup' ? 'Drops open once the ladder is frozen after round 10.' : 'Drops are closed.' };
  const supabase = await createClient();
  const own = await supabase.from('squad').select('team_id, is_keeper').eq('player_id', playerId).maybeSingle();
  if (own.data?.team_id !== me.team_id) return { ok: false, error: 'You can only drop your own players.' };
  const mine = cur.drops.filter((d) => d.team_id === me.team_id);
  if (mine.some((d) => d.player_id === playerId)) {
    const r = await supabase.from('msd_drops').delete().eq('season', MSD_SEASON).eq('player_id', playerId);
    return r.error ? err(r.error.message) : done();
  }
  if (mine.length >= MSD_DROPS) return { ok: false, error: `That’s ${MSD_DROPS} already. Untick one first.` };
  const r = await supabase.from('msd_drops').insert({ season: MSD_SEASON, team_id: me.team_id, player_id: playerId });
  return r.error ? err(r.error.message) : done();
}

/** Take a player with the pick on the clock. Coaches pick for themselves; the commish can pick for anyone. */
export async function makeMsdPick(playerId: number, playerName: string): Promise<Res> {
  const me = await getCoach();
  if (!me) return { ok: false, error: 'Only coaches can pick.' };
  const cur = await loadMsd();
  if (!cur.ready) return { ok: false, error: MIG };
  if (cur.state.phase !== 'drafting') return { ok: false, error: 'The draft isn’t live.' };
  const pick = onTheClock(cur.picks, cur.selections);
  if (!pick) return { ok: false, error: 'Every pick has been made.' };
  if (pick.owner_team_id !== me.team_id && !me.is_commish) return { ok: false, error: 'You’re not on the clock.' };
  if (cur.selections.some((s) => s.player_id === playerId)) return { ok: false, error: 'He’s already gone.' };
  const supabase = await createClient();
  const sq = await supabase.from('squad').select('team_id').eq('player_id', playerId).maybeSingle();
  const dropped = cur.drops.some((d) => d.player_id === playerId);
  if (sq.data && !dropped) return { ok: false, error: 'He’s on a list. Only free agents and this draft’s drops can be picked.' };
  if (dropped && cur.drops.find((d) => d.player_id === playerId)?.team_id === pick.owner_team_id) return { ok: false, error: 'You can’t pick back a player you dropped.' };
  const r = await supabase.from('msd_selections').insert({ season: MSD_SEASON, pick_id: pick.id, team_id: pick.owner_team_id, player_id: playerId, player_name: playerName.slice(0, 80) });
  if (r.error) return err(r.error.message);
  await supabase.from('msd_state').update({ on_clock_since: new Date().toISOString() }).eq('season', MSD_SEASON);
  return done();
}

export async function undoMsdPick(): Promise<Res> {
  if (!(await commish())) return { ok: false, error: 'Commish only.' };
  const cur = await loadMsd();
  const last = [...cur.selections].filter((s) => !s.applied).sort((a, b) => Date.parse(b.made_at) - Date.parse(a.made_at))[0];
  if (!last) return { ok: false, error: 'Nothing to undo.' };
  const supabase = await createClient();
  const r = await supabase.from('msd_selections').delete().eq('season', MSD_SEASON).eq('pick_id', last.pick_id);
  return r.error ? err(r.error.message) : done();
}

/** Commish: drop the dropped players, add the picked ones (free agents are added to players first), and close the draft. */
export async function applyMsd(): Promise<Res> {
  if (!(await commish())) return { ok: false, error: 'Commish only.' };
  const supabase = await createClient();
  const cur = await loadMsd();
  if (!cur.ready) return { ok: false, error: MIG };
  const league = await getLeague();
  const fa = new Map(league.freeAgents.map((p) => [p.id, p]));
  const pickById = new Map(cur.picks.map((p) => [p.id, p]));
  if (cur.drops.length) {
    const r = await supabase.from('squad').delete().in('player_id', cur.drops.map((d) => d.player_id));
    if (r.error) return err(r.error.message);
  }
  for (const s of cur.selections.filter((x) => !x.applied)) {
    const exists = await supabase.from('players').select('id').eq('id', s.player_id).maybeSingle();
    if (!exists.data) {
      const f = fa.get(s.player_id);
      if (!f) return { ok: false, error: `Couldn’t find ${s.player_name} to add.` };
      const ins = await supabase.from('players').insert({ id: f.id, name: f.name, full_name: f.full_name, positions: f.positions, afl_club: f.afl_club, birth_date: f.birth_date,
        draft_pick: f.draft_pick, draft_year: f.draft_year, dfs_id: f.dfs_id, height_cm: f.height_cm, debut_year: f.debut_year, career_games: f.career_games, hist: f.hist });
      if (ins.error) return err(ins.error.message);
    }
    const pk = pickById.get(s.pick_id);
    const up = await supabase.from('squad').upsert({ player_id: s.player_id, team_id: s.team_id, is_keeper: false, is_rookie_keeper: false,
      acquired_how: `${MSD_SEASON} MSD R${pk?.round ?? '?'} #${pk?.overall ?? '?'}`, acquired_season: MSD_SEASON }, { onConflict: 'player_id' });
    if (up.error) return err(up.error.message);
    const m = await supabase.from('msd_selections').update({ applied: true }).eq('season', MSD_SEASON).eq('pick_id', s.pick_id);
    if (m.error) return err(m.error.message);
  }
  await supabase.from('msd_state').update({ phase: 'done', updated_at: new Date().toISOString() }).eq('season', MSD_SEASON);
  revalidatePath('/clubhouse');
  return done();
}
