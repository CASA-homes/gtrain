import { redirect } from 'next/navigation';
import { liveRound, type LRound } from '@/lib/aflw';
import { getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';

/** Shared loader for the Live Matchups pages: who's signed in, the clubs, and the AFL Fantasy round. */
export async function loadLive(round?: number) {
  const me = await getMe();
  if (!me) redirect('/');
  const supabase = await createClient();
  const { data: teams } = await supabase.from('teams').select('id,name,short_code').order('id');
  let data: LRound | null = null, error: string | null = null;
  try { data = await liveRound(round); } catch (e) { error = (e as Error).message; }
  return { me, teams: teams ?? [], data, error };
}
