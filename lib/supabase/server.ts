import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { LEAGUE_COOKIE, parseLeagueId } from '@/lib/league';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Every query is scoped to the league in this header (the database checks membership).
      global: { headers: { 'x-league-id': String(parseLeagueId(cookieStore.get(LEAGUE_COOKIE)?.value)) } },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

/** The current request's league id. */
export async function currentLeagueId(): Promise<number> {
  return parseLeagueId((await cookies()).get(LEAGUE_COOKIE)?.value);
}

/** A client whose queries are scoped to a specific league (e.g. a league just created, before the cookie switches). */
export async function createClientForLeague(leagueId: number) {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { 'x-league-id': String(leagueId) } },
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => { /* read-only here */ } },
    },
  );
}
