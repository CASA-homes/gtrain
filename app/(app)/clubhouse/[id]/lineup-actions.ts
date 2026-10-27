'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach } from '@/lib/data';
import type { Line, Slot } from '@/lib/ratings';

const LIMIT: Record<Slot, number> = { DEF: 5, MID: 7, RUC: 1, FWD: 5, BENCH: 4 };

export async function saveLineup(teamId: number, entries: { id: number; slot: Slot | null }[]) {
  const me = await getCoach();
  if (!me || me.team_id !== teamId) return { error: 'You can only set the lineup for your own club.' };

  const supabase = await createClient();
  const { data: squad, error } = await supabase.from('squad').select('player_id, players(name, positions)').eq('team_id', teamId);
  if (error) return { error: error.message };
  const own = new Map((squad ?? []).map((s) => [s.player_id, s.players as unknown as { name: string; positions: Line[] }]));

  const bySlot = new Map<Slot, number[]>();
  for (const e of entries) {
    const p = own.get(e.id);
    if (!p) return { error: 'That player isn’t on your list.' };
    if (!e.slot) continue;
    if (e.slot !== 'BENCH' && !p.positions.includes(e.slot)) return { error: `${p.name} can’t play ${e.slot}.` };
    bySlot.set(e.slot, [...(bySlot.get(e.slot) ?? []), e.id]);
  }
  for (const [slot, ids] of bySlot) if (ids.length > LIMIT[slot]) return { error: `Too many in ${slot}: ${ids.length} of ${LIMIT[slot]}.` };

  const clear = await supabase.from('squad').update({ lineup: null }).eq('team_id', teamId);
  if (clear.error) return { error: clear.error.message };
  for (const [slot, ids] of bySlot) {
    const r = await supabase.from('squad').update({ lineup: slot }).eq('team_id', teamId).in('player_id', ids);
    if (r.error) return { error: r.error.message };
  }
  revalidatePath(`/clubhouse/${teamId}`);
  return { ok: true };
}

export async function resetLineup(teamId: number) {
  const me = await getCoach();
  if (!me || me.team_id !== teamId) return { error: 'You can only set the lineup for your own club.' };
  const supabase = await createClient();
  const r = await supabase.from('squad').update({ lineup: null }).eq('team_id', teamId);
  if (r.error) return { error: r.error.message };
  revalidatePath(`/clubhouse/${teamId}`);
  return { ok: true };
}

export async function setStatusOverride(teamId: number, status: string | null) {
  const me = await getCoach();
  if (!me?.is_commish) return { error: 'Only the commissioner can set a team’s status.' };
  const supabase = await createClient();
  const r = await supabase.from('teams').update({ status_override: status }).eq('id', teamId);
  if (r.error) return { error: r.error.message };
  revalidatePath(`/clubhouse/${teamId}`);
  revalidatePath('/rankings');
  return { ok: true };
}
