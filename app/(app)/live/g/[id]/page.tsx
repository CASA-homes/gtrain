import { notFound } from 'next/navigation';
import { GameRoom } from '@/components/live/kit';
import { createClient } from '@/lib/supabase/server';
import { loadGame } from '../../actions';
import { FeedDown } from '../../FeedDown';
import { loadLive } from '../../load';

export const metadata = { title: 'Game' };
export const dynamic = 'force-dynamic';

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { game, picks } = await loadGame(Number(id));
  if (!game) notFound();
  const { me, teams, data, error } = await loadLive(game.round);
  if (!data) return <FeedDown error={error} />;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <GameRoom initialRound={data} initialGame={game} initialPicks={picks} teams={teams} myTeamId={me.team_id} canManage={me.is_commish || game.created_by === user?.id} />;
}
