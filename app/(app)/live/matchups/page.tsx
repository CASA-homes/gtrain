import { redirect } from 'next/navigation';
import { LiveMatchups } from '@/components/live/live-matchups';
import { getLeague, getMe } from '@/lib/data';
import { buildMensRound } from '@/lib/mens-round';
import { withClubRows } from '@/lib/club-rounds';
import { buildCup } from '@/lib/cup-data';
import { buildMatchday } from '@/lib/matchday-data';

export const metadata = { title: 'Live Matchups' };
export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  const me = await getMe();
  if (!me) redirect('/');
  const league = await getLeague();
  const cup = await buildCup(league, me.team_id);
  const md = await buildMatchday(league, me.team_id, cup);
  return <LiveMatchups mens={withClubRows(buildMensRound(league))} md={md} />;
}
