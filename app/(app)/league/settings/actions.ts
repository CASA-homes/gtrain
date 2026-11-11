'use server';
// League settings: the commish names the league.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';

export async function setLeagueName(raw: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can rename the league.' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Give the league a name.' };
  if (name.length > 40) return { ok: false, error: 'Keep it to 40 characters or fewer.' };
  const supabase = await createClient();
  const { error } = await supabase.from('league_profile').upsert({ id: 1, name, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return { ok: false, error: /league_profile/.test(error.message) ? 'Run supabase/migrations/0026_league_name.sql in Supabase first.' : error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
