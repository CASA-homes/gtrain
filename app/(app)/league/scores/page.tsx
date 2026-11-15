import { redirect } from 'next/navigation';
import { getMe } from '@/lib/data';
import { FEED, applyOverrides, feedLiveRound, type LRound } from '@/lib/scores';
import { loadScoreState } from '@/lib/scores/server';
import Link from 'next/link';
import { ScoreOverride } from '@/components/league/ScoreOverride';
import { ContractOverrides } from '@/components/league/ContractOverrides';

export const metadata = { title: 'Overrides' };
export const dynamic = 'force-dynamic';

// Commish tools: fix or fill in player scores when the live feed is wrong or down. Coaches can view it (and the log).
export default async function ScoreOverridePage({ searchParams }: { searchParams: Promise<{ round?: string; tab?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/');
  const sp = await searchParams;
  const tab = sp.tab === 'contracts' && me.is_commish ? 'contracts' : 'scores';
  const nav = me.is_commish ? (
    <nav className="co-tabs" aria-label="Overrides">
      <Link href="/league/scores" aria-current={tab === 'scores' ? 'page' : undefined}>Scores</Link>
      <Link href="/league/scores?tab=contracts" aria-current={tab === 'contracts' ? 'page' : undefined}>Contracts</Link>
    </nav>
  ) : null;
  if (tab === 'contracts') return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 48 }}>
      <div><Link href="/league" className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', textDecoration: 'none' }}>← The League · Commish tools</Link>
        <h1 style={{ margin: '6px 0 0', font: '600 40px/1.05 var(--font)', letterSpacing: '-.035em' }}>Overrides</h1></div>
      {nav}
      <ContractOverrides />
    </div>
  );
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
      nav={nav}
    />
  );
}
