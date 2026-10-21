'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';

export async function saveKeepers(teamId: number, keeperIds: number[], rookieId: number | null) {
  const me = await getMe();
  if (!me || (me.team_id !== teamId && !me.is_commish)) return { error: 'You can only set keepers for your own club.' };
  if (keeperIds.length > 17) return { error: 'Keeper limit is 17, plus one rookie.' };

  const supabase = await createClient();
  // Clear, then set. Limits are also enforced by a database trigger.
  const clear = await supabase.from('squad').update({ is_keeper: false, is_rookie_keeper: false }).eq('team_id', teamId);
  if (clear.error) return { error: clear.error.message };
  if (keeperIds.length) {
    const set = await supabase.from('squad').update({ is_keeper: true }).eq('team_id', teamId).in('player_id', keeperIds);
    if (set.error) return { error: set.error.message };
  }
  if (rookieId) {
    const r = await supabase.from('squad').update({ is_rookie_keeper: true, is_keeper: false }).eq('team_id', teamId).eq('player_id', rookieId);
    if (r.error) return { error: r.error.message };
  }
  revalidatePath(`/clubhouse/${teamId}`);
  return { ok: true };
}
