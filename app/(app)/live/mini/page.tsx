import { MiniHome } from '@/components/live/mini-home';
import { listGames } from '../actions';
import { FeedDown } from '../FeedDown';
import { loadLive } from '../load';

export const metadata = { title: 'Mini Games' };
export const dynamic = 'force-dynamic';

export default async function MiniGamesPage() {
  const { me, teams, data, error } = await loadLive();
  if (!data) return <FeedDown error={error} />;
  const { ready, games } = await listGames();
  return <MiniHome initial={data} games={games} ready={ready} teams={teams} myTeamId={me.team_id} />;
}
