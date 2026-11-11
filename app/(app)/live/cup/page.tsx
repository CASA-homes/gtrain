import { redirect } from 'next/navigation';
import { CupPage } from '@/components/live/cup';
import { getLeague, getMe } from '@/lib/data';
import { buildCup } from '@/lib/cup-data';
import { loadCupPrizes } from '../cup-actions';

export const metadata = { title: 'Knockout Cup' };
export const dynamic = 'force-dynamic';

export default async function CupRoute() {
  const me = await getMe();
  if (!me) redirect('/');
  const [league, prizes] = await Promise.all([getLeague(), loadCupPrizes()]);
  return <CupPage data={await buildCup(league, me.team_id)} isCommish={me.is_commish} prizes={prizes} />;
}
