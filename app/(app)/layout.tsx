import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { getLeague, getMe } from '@/lib/data';
import { createClient, currentLeagueId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) {
    // Signed in but not a member of the league in your cookie (e.g. your only league is a new one): switch to yours.
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    if (auth?.claims?.sub) redirect('/auth/league?from=layout');
    redirect('/');
  }
  const supabase = await createClient();
  const [{ teams }, lq, current] = await Promise.all([getLeague(), supabase.rpc('my_leagues'), currentLeagueId()]);
  const leagues = ((lq.data ?? []) as { id: number; name: string }[]).map((l) => ({ id: l.id, name: l.name }));
  const mine = teams.find((t) => t.id === me.team_id);
  return (
    <>
      <Nav myTeamId={me.team_id} shortCode={me.is_guest ? 'G' : mine?.short_code ?? '?'} guest={!!me.is_guest} logo={mine?.logo_url ?? null} leagues={leagues} leagueId={current} />
      <main className="page">{children}</main>
    </>
  );
}
