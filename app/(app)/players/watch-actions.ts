'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { cookieIds, WATCH_COOKIE } from '@/lib/watchlist';

/** Star or unstar a player for the signed-in coach. Returns whether he's now on the list. */
export async function toggleWatch(playerId: number, on: boolean): Promise<{ on: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { on: !on };
  const jar = await cookies();
  const local = await cookieIds();
  const res = on
    ? await supabase.from('watchlist').upsert({ user_id: user.id, player_id: playerId }, { onConflict: 'user_id,player_id' })
    : await supabase.from('watchlist').delete().eq('user_id', user.id).eq('player_id', playerId);
  if (!res.error) {
    // Table is live: move anything saved on this device into it, then drop the cookie.
    const rest = local.filter((x) => x !== playerId);
    if (rest.length) await supabase.from('watchlist').upsert(rest.map((pid) => ({ user_id: user.id, player_id: pid })), { onConflict: 'user_id,player_id' });
    if (local.length) jar.delete(WATCH_COOKIE);
  } else {
    const next = on ? [...new Set([...local, playerId])] : local.filter((x) => x !== playerId);
    jar.set(WATCH_COOKIE, next.join('.'), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath('/players');
  return { on };
}
