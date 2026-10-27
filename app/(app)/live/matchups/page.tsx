import { MyMatchups } from '@/components/live/sections';
import { listGames } from '../actions';
import { FeedDown } from '../FeedDown';
import { loadLive } from '../load';

export const metadata = { title: 'Matchups' };
export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  const { me, teams, data, error } = await loadLive();
  if (!data) return <FeedDown error={error} />;
  const { games } = await listGames();
  return <MyMatchups initial={data} games={games} teams={teams} myTeamId={me.team_id} />;
}
