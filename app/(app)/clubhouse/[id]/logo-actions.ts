'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Point a club at its uploaded logo, or clear it (url = null). The database checks it's your club (or you're the commish). */
export async function setClubLogo(teamId: number, url: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_team_logo', { team: teamId, url });
  if (error) return { ok: false, error: error.message.includes('function') ? 'Logos go live once the commish runs the latest database update.' : error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
