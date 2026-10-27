import { redirect } from 'next/navigation';
import { LiveBoard } from '@/components/LiveBoard';
import { liveRound, type LRound } from '@/lib/aflw';
import { getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { loadMini } from './actions';

export const metadata = { title: 'Live' };
export const dynamic = 'force-dynamic';

export default async function LivePage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!me) redirect('/');
  let data: LRound | null = null, error: string | null = null;
  try { data = await liveRound(Number(sp.round) || undefined); } catch (e) { error = (e as Error).message; }
  const supabase = await createClient();
  const { data: teams } = await supabase.from('teams').select('id,name,short_code').order('id');
  const mini = data ? await loadMini(data.round) : { ready: false, lineups: {}, matchups: [] };
  return (
    <div className="wrap" style={{ maxWidth: 1240 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 18px' }}>
        <span className="eyebrow">Live · AFLW test run</span>
        <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em', margin: 0 }}>Live scores</h1>
        <p className="muted" style={{ margin: 0, maxWidth: '68ch' }}>
          AFL Fantasy scores straight from the official game, refreshing every 25 seconds while games are on. The mini game pits
          G-Train clubs’ 11s against each other for the round; the commish picks the teams.
        </p>
      </div>
      {error || !data
        ? <div className="card" style={{ padding: 18 }}>Couldn’t reach the AFL Fantasy feed right now ({error}). Try again in a minute.</div>
        : <LiveBoard initial={data} teams={teams ?? []} mini={mini} myTeamId={me.team_id} isCommish={me.is_commish} />}
    </div>
  );
}
