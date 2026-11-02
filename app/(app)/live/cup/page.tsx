import { redirect } from 'next/navigation';
import { CupPage } from '@/components/live/cup';
import { getLeague, getMe } from '@/lib/data';
import { buildCup } from '@/lib/cup-data';

export const metadata = { title: 'Knockout Cup' };
export const dynamic = 'force-dynamic';

export default async function CupRoute() {
  const me = await getMe();
  if (!me) redirect('/');
  const league = await getLeague();
  return <CupPage data={await buildCup(league, me.team_id)} isCommish={me.is_commish} />;
}
