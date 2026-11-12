'use server';
// League settings: the commish names the league.
import { revalidatePath } from 'next/cache';
import { createClient, currentLeagueId } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';

export async function setLeagueName(raw: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can rename the league.' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Give the league a name.' };
  if (name.length > 40) return { ok: false, error: 'Keep it to 40 characters or fewer.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('leagues').update({ name }).eq('id', await currentLeagueId()).select('id');
  if (error) return { ok: false, error: /leagues/.test(error.message) ? 'Run supabase/migrations/0027_multi_league.sql in Supabase first.' : error.message };
  if (!data?.length) return { ok: false, error: 'Could not save the league name.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}
