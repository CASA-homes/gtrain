// The signed-in coach's watchlist. Lives in the watchlist table once it exists (synced across devices);
// until then it's kept in a cookie on this device, and moved into the table the first time the table is there.
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export const WATCH_COOKIE = 'gt_watch';

export async function cookieIds(): Promise<number[]> {
  const v = (await cookies()).get(WATCH_COOKIE)?.value ?? '';
  return v.split('.').map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

export async function getWatchlist(): Promise<{ ids: Set<number>; synced: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const local = await cookieIds();
  if (!user) return { ids: new Set(local), synced: false };
  const q = await supabase.from('watchlist').select('player_id').eq('user_id', user.id);
  if (q.error) return { ids: new Set(local), synced: false };
  const ids = new Set((q.data ?? []).map((r) => Number(r.player_id)));
  return { ids: new Set([...ids, ...local]), synced: true };
}
