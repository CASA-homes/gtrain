import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { getLeague, getMe } from '@/lib/data';
import { createClient, currentLeagueId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/');
  const supabase = await createClient();
  const lid = await currentLeagueId();
  // While a new league's coaches pick their squads, every page points them (and the commish) at squad setup.
  const [{ teams }, { data: lq }, lgQ] = await Promise.all([getLeague(), supabase.rpc('my_leagues'),
    lid !== 1 && !me.is_guest ? supabase.from('leagues').select('setup_mode, squads_locked_at').eq('id', lid).maybeSingle() : Promise.resolve({ data: null })]);
  const lg = lgQ.data as { setup_mode?: string | null; squads_locked_at?: string | null } | null;
  const picking = lg?.setup_mode === 'picks' && !lg.squads_locked_at;
  const leagues = ((lq ?? []) as { id: number; name: string; is_commish: boolean }[]).map((l) => ({ id: l.id, name: l.name, is_commish: l.is_commish }));
  const mine = teams.find((t) => t.id === me.team_id);
  return (
    <>
      <Nav myTeamId={me.team_id} shortCode={me.is_guest ? 'G' : mine?.short_code ?? '?'} guest={!!me.is_guest} logo={mine?.logo_url ?? null} leagues={leagues} leagueId={lid} />
      <main className="page">
        {picking && (
          <p className="su-prompt">
            <span>{me.is_commish ? 'Coaches are picking their squads.' : 'Squads are being picked. Tick yours off the AFL list.'}</span>
            <Link href="/league/setup">{me.is_commish ? 'Squad board →' : 'Pick your squad →'}</Link>
          </p>
        )}
        {children}
      </main>
    </>
  );
}
