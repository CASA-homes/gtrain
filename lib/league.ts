// Which league a request is for. The app sends it to Supabase as the x-league-id header (see lib/supabase/*), and the
// database scopes every query to it (supabase/migrations/0027_multi_league.sql). G-Train is league 1, the default.
export const LEAGUE_COOKIE = 'khq_league';
export const DEFAULT_LEAGUE_ID = 1;

/** A league id from a cookie value, or the default when it's missing or malformed. */
export function parseLeagueId(v: string | undefined | null): number {
  return v && /^[0-9]{1,9}$/.test(v) ? Number(v) : DEFAULT_LEAGUE_ID;
}
