'use client';
import { createBrowserClient } from '@supabase/ssr';
import { LEAGUE_COOKIE, parseLeagueId } from '@/lib/league';

function leagueFromCookie(): number {
  if (typeof document === 'undefined') return parseLeagueId(null);
  const m = document.cookie.match(new RegExp(`(?:^|; )${LEAGUE_COOKIE}=([^;]*)`));
  return parseLeagueId(m ? decodeURIComponent(m[1]) : null);
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Every query is scoped to the league in this header (the database checks membership).
    { global: { headers: { 'x-league-id': String(leagueFromCookie()) } } },
  );
}
