import { GamesList } from '@/components/live/sections';
import { listGames } from '../actions';
import { FeedDown } from '../FeedDown';
import { loadLive } from '../load';

export const metadata = { title: 'Current games' };
export const dynamic = 'force-dynamic';

export default async function GamesPage() {
  const { me, teams, data, error } = await loadLive();
  if (!data) return <FeedDown error={error} />;
  const { ready, games } = await listGames();
  return <GamesList round={data.round} roundName={data.name} games={games} ready={ready} teams={teams} myTeamId={me.team_id} />;
}
