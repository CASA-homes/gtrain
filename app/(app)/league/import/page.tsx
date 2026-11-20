import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubHead } from '@/components/LeagueSubpage';
import { getLeague, getMe } from '@/lib/data';
import { isLegacyLeague } from '@/lib/league-scope';
import { createClient } from '@/lib/supabase/server';
import { ImportFlow } from './ImportFlow';

export const metadata = { title: 'Import your league' };
export const dynamic = 'force-dynamic';

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ via?: string }> }) {
  const [me, sp, legacy] = await Promise.all([getMe(), searchParams, isLegacyLeague()]);
  if (!me) redirect('/');
  if (!me.is_commish || legacy) return (
    <div className="wrap stack" style={{ gap: 14 }}>
      <SubHead eyebrow="League" title="Import your league" sub="Bring your rosters across from another app" />
      <div className="card" style={{ padding: 18 }}><p style={{ margin: 0 }}>{legacy ? 'G-Train’s lists are already set up.' : 'Only the commish can import rosters.'} <Link href="/league">Back to the league</Link></p></div>
    </div>
  );
  const league = await getLeague();
  const supabase = await createClient();
  const { count } = await supabase.from('players').select('id', { count: 'exact', head: true });
  const onLists = league.players.filter((p) => p.team_id != null).length;
  return (
    <div className="wrap stack" style={{ gap: 14, maxWidth: 980 }}>
      <SubHead eyebrow="League" title="Import your league" sub="Bring your rosters across from another app" />
      <ImportFlow via={sp.via === 'screens' ? 'screens' : 'sheet'} teams={league.teams.map((t) => ({ id: t.id, name: t.name }))} playerCount={count ?? 0} onLists={onLists} />
    </div>
  );
}
