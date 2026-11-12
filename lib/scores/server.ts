// Server-only: live scores with the commish's overrides applied. Every server page, route and action that needs
// scores calls liveRound from here (not the raw feed), so an override counts everywhere at once.
import { createClient } from '@/lib/supabase/server';
import { COMP, applyOverrides, feedLiveRound, type LRound, type LogRow, type OverrideRow, type RoundState } from './index';

/** The commish's settings for one round: pause/lock state, overrides and the change log. Empty if the tables aren't there yet. */
export async function loadScoreState(round: number): Promise<{ state: RoundState | null; overrides: OverrideRow[]; log: LogRow[]; ready: boolean }> {
  try {
    const supabase = await createClient();
    const [st, ov, lg] = await Promise.all([
      supabase.from('score_rounds').select('paused,locked_at,snapshot').eq('comp', COMP).eq('round', round).maybeSingle(),
      supabase.from('score_overrides').select('player_id,player_name,score,feed_score,reason,set_at').eq('comp', COMP).eq('round', round),
      supabase.from('score_log').select('id,what,who,at').eq('comp', COMP).eq('round', round).order('at', { ascending: false }).limit(30),
    ]);
    if (st.error || ov.error || lg.error) return { state: null, overrides: [], log: [], ready: false };
    return { state: (st.data as RoundState | null) ?? null, overrides: (ov.data as OverrideRow[]) ?? [], log: (lg.data as LogRow[]) ?? [], ready: true };
  } catch {
    return { state: null, overrides: [], log: [], ready: false };
  }
}

/** One round of live scores, with locks, pauses and overrides applied. Throws only if the feed itself is unreachable. */
export async function liveRound(round?: number): Promise<LRound> {
  const r = await feedLiveRound(round);
  const { state, overrides } = await loadScoreState(r.round);
  return applyOverrides(r, state, overrides);
}
