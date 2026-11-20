'use server';
import { cookies } from 'next/headers';
import { LEAGUE_COOKIE } from '@/lib/league';
import { createClient } from '@/lib/supabase/server';

export interface NewLeague { name: string; club: string; coach: string; clubs: number; names: string[]; keeperCap: number; seasonCap: number; keepers: number; rounds: number }
type Res = { ok: true; leagueId: number; code: string } | { ok: false; error: string };

/** Create the league, name its clubs, and point this browser at it. */
export async function createLeague(n: NewLeague): Promise<Res> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: 'Your sign-in has expired. Log in again.' };
  const { data, error } = await supabase.rpc('create_league', {
    p_name: n.name, p_club: n.club, p_coach: n.coach, p_clubs: n.clubs,
    p_keeper_cap: n.keeperCap, p_season_cap: n.seasonCap, p_keepers: n.keepers, p_rounds: n.rounds,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { league_id: number; join_code: string };
  const names = [n.club, ...n.names.slice(1)].map((x) => x.trim());
  if (names.slice(1).some(Boolean)) await supabase.rpc('rename_clubs', { p_league: r.league_id, p_names: names });
  (await cookies()).set(LEAGUE_COOKIE, String(r.league_id), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return { ok: true, leagueId: r.league_id, code: r.join_code };
}
