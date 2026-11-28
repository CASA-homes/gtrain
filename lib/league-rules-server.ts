// Server-side loader for the league rules (see lib/league-rules.ts).
import { cache } from 'react';
import { createClient, currentLeagueId } from '@/lib/supabase/server';
import { mergeRules, type LeagueRules } from '@/lib/league-rules';

export const getLeagueRules = cache(async (): Promise<LeagueRules> => {
  const supabase = await createClient();
  const { data } = await supabase.from('leagues').select('settings').eq('id', await currentLeagueId()).maybeSingle();
  return mergeRules(((data?.settings ?? {}) as { rules?: Partial<LeagueRules> }).rules);
});
