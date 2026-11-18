'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LEAGUE_COOKIE } from '@/lib/league';
import { createClient } from '@/lib/supabase/server';

/** Switch the league this browser is looking at. Only to a league you're a member of. */
export async function switchLeague(leagueId: number): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_leagues');
  if (!((data ?? []) as { id: number }[]).some((l) => l.id === leagueId)) return { ok: false, error: 'You’re not in that league.' };
  (await cookies()).set(LEAGUE_COOKIE, String(leagueId), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/', 'layout');
  return { ok: true };
}
