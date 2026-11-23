'use server';
// Squad setup: coaches pick their own players, the commish signs off, settles flags, fixes picks and locks squads.
// Every change goes through a database function (0078) that checks who's asking and that squads aren't locked.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type Res = { ok: true } | { ok: false; error: string };

async function call(fn: string, args: Record<string, unknown>): Promise<Res> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message.includes('Could not find the function') ? 'Squad setup isn’t switched on yet. Ask the commish.' : error.message };
  revalidatePath('/league/setup');
  return { ok: true };
}

/** Coach: add or remove a player on your own list. */
export async function pickPlayer(playerId: number, add: boolean) { return call('squad_pick', { p_player: playerId, p_add: add }); }
/** Coach: hand your squad to the commish. */
export async function submitSquad() { return call('squad_submit', {}); }
/** Coach: "he's mine". */
export async function flagPlayer(playerId: number) { return call('squad_flag', { p_player: playerId }); }
/** Commish: put a player on any club, or off every list (team null). */
export async function adminSet(playerId: number, teamId: number | null) { return call('squad_admin_set', { p_player: playerId, p_team: teamId }); }
/** Commish: settle a flag. */
export async function resolveFlag(flagId: number, move: boolean) { return call('squad_flag_resolve', { p_flag: flagId, p_move: move }); }
/** Commish: sign a squad off, or send it back. */
export async function approveSquad(teamId: number, on: boolean) { return call('squad_approve', { p_team: teamId, p_on: on }); }
/** Commish: lock or unlock squads. */
export async function lockSquads(on: boolean) {
  const r = await call('squad_lock', { p_on: on });
  if (r.ok) revalidatePath('/', 'layout');
  return r;
}
/** Commish: move a pick to another club. */
export async function movePick(pickId: number, teamId: number) { return call('squad_pick_owner', { p_pick: pickId, p_team: teamId }); }
/** Commish: how squads get filled. */
export async function setSetupMode(mode: 'picks' | 'draft' | 'import') {
  const r = await call('set_setup_mode', { p_mode: mode });
  if (r.ok) revalidatePath('/', 'layout');
  return r;
}
