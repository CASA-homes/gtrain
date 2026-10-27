import { NewGame } from '@/components/live/sections';
import { FeedDown } from '../FeedDown';
import { loadLive } from '../load';

export const metadata = { title: 'New game' };
export const dynamic = 'force-dynamic';

export default async function NewGamePage() {
  const { me, teams, data, error } = await loadLive();
  if (!data) return <FeedDown error={error} />;
  return <NewGame rounds={data.rounds} current={data.round} teams={teams} myTeamId={me.team_id} />;
}
