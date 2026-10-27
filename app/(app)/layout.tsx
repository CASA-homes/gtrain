import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { getLeague, getMe } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/');
  const { teams } = await getLeague();
  const mine = teams.find((t) => t.id === me.team_id);
  return (
    <>
      <Nav myTeamId={me.team_id} shortCode={me.is_guest ? 'G' : mine?.short_code ?? '?'} guest={!!me.is_guest} />
      <main className="page">{children}</main>
    </>
  );
}
