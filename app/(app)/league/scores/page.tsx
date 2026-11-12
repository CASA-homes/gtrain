import { redirect } from 'next/navigation';
import { getMe } from '@/lib/data';
import { FEED, applyOverrides, feedLiveRound, type LRound } from '@/lib/scores';
import { loadScoreState } from '@/lib/scores/server';
import { ScoreOverride } from '@/components/league/ScoreOverride';

export const metadata = { title: 'Score override' };
export const dynamic = 'force-dynamic';

// Commish tools: fix or fill in player scores when the live feed is wrong or down. Coaches can view it (and the log).
export default async function ScoreOverridePage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/');
  const sp = await searchParams;
  let feed: LRound | null = null, error: string | null = null;
  try { feed = await feedLiveRound(sp.round != null ? Number(sp.round) : undefined); } catch (e) { error = (e as Error).message; }
  const s = feed ? await loadScoreState(feed.round) : { state: null, overrides: [], log: [], ready: true };
  const merged = feed ? applyOverrides(feed, s.state, s.overrides) : null;
  return (
    <ScoreOverride
      comp={FEED.label}
      round={merged}
      feedError={error}
      state={s.state ? { paused: s.state.paused, lockedAt: s.state.locked_at } : null}
      overrides={s.overrides}
      log={s.log}
      ready={s.ready}
      isCommish={!!me.is_commish}
    />
  );
}
