import { Hub } from '@/components/live/sections';
import { listGames } from './actions';
import { FeedDown } from './FeedDown';
import { loadLive } from './load';

export const metadata = { title: 'Live Matchups' };
export const dynamic = 'force-dynamic';

export default async function LiveHome() {
  const { me, teams, data, error } = await loadLive();
  if (!data) return <FeedDown error={error} />;
  const { ready, games } = await listGames();
  return <Hub initial={data} games={games} ready={ready} teams={teams} myTeamId={me.team_id} />;
}
