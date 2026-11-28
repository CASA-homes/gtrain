// Server-side loader for the league rules (see lib/league-rules.ts).
import { cache } from 'react';
import { createClient, currentLeagueId } from '@/lib/supabase/server';
import { mergeRules, type LeagueRules } from '@/lib/league-rules';
import { R1_2027 } from '@/lib/mens-round';
import { inPreseason } from '@/lib/league-scoring';

export const getLeagueRules = cache(async (): Promise<LeagueRules> => {
  const supabase = await createClient();
  const { data } = await supabase.from('leagues').select('settings').eq('id', await currentLeagueId()).maybeSingle();
  return mergeRules(((data?.settings ?? {}) as { rules?: Partial<LeagueRules> }).rules);
});

/** The season's first bounce (round 1 of the current fixture). */
export const seasonStart = () => [...R1_2027].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0]?.start ?? null;
/** The scoring formula can only change in the preseason: before the first bounce, or once next preseason opens. */
export const formulaOpen = (rules: LeagueRules, now = Date.now()) => inPreseason(seasonStart(), rules.dates.preseason_open, now);
