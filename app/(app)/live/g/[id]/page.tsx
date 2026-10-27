import { notFound } from 'next/navigation';
import { CapGame } from '@/components/live/cap';
import { GameRoom } from '@/components/live/kit';
import { createClient } from '@/lib/supabase/server';
import { loadEntries, loadGame } from '../../actions';
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
  const canManage = me.is_commish || game.created_by === user?.id;
  if (game.kind === 'cap5') {
    const { ready, entries } = await loadEntries(game.id);
    return <CapGame initialRound={data} game={game} initialEntries={entries} ready={ready} teams={teams} myTeamId={me.team_id} canManage={canManage} />;
  }
  return <GameRoom initialRound={data} initialGame={game} initialPicks={picks} teams={teams} myTeamId={me.team_id} canManage={canManage} />;
}
