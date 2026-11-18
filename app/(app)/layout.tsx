import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { getLeague, getMe } from '@/lib/data';
import { createClient, currentLeagueId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/');
  const supabase = await createClient();
  const [{ teams }, lid, { data: lq }] = await Promise.all([getLeague(), currentLeagueId(), supabase.rpc('my_leagues')]);
  const leagues = ((lq ?? []) as { id: number; name: string; is_commish: boolean }[]).map((l) => ({ id: l.id, name: l.name, is_commish: l.is_commish }));
  const mine = teams.find((t) => t.id === me.team_id);
  return (
    <>
      <Nav myTeamId={me.team_id} shortCode={me.is_guest ? 'G' : mine?.short_code ?? '?'} guest={!!me.is_guest} logo={mine?.logo_url ?? null} leagues={leagues} leagueId={lid} />
      <main className="page">{children}</main>
    </>
  );
}
