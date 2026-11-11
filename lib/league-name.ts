// The league's name, set by the commish in League settings (supabase/migrations/0026_league_name.sql).
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

import { DEFAULT_LEAGUE_NAME } from '@/lib/league-title';
export { DEFAULT_LEAGUE_NAME, leagueTitle } from '@/lib/league-title';

/** The saved league name, or G-Train until the migration has run. Works signed out too. */
export const getLeagueName = cache(async (): Promise<string> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('league_name');
    return !error && typeof data === 'string' && data.trim() ? data.trim() : DEFAULT_LEAGUE_NAME;
  } catch {
    return DEFAULT_LEAGUE_NAME;
  }
});
