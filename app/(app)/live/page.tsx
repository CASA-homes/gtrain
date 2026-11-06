import { Matchday } from '@/components/live/matchday';
import { getLeague, getMe } from '@/lib/data';
import { buildCup } from '@/lib/cup-data';
import { buildMatchday } from '@/lib/matchday-data';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Matchday' };
export const dynamic = 'force-dynamic';

export default async function MatchdayPage() {
  const me = await getMe();
  if (!me) redirect('/');
  const league = await getLeague();
  const cup = await buildCup(league, me.team_id);
  const data = await buildMatchday(league, me.team_id, cup);
  return <Matchday data={data} cup={cup} />;
}
