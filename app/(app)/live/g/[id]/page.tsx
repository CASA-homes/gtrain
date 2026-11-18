import { notFound } from 'next/navigation';
import { CapGame } from '@/components/live/cap';
import { GameRoom } from '@/components/live/kit';
import { createClient } from '@/lib/supabase/server';
import { loadEntries, loadGame } from '../../actions';
import { FeedDown } from '../../FeedDown';
import { loadLive } from '../../load';
import { KtPotWrap } from '@/components/live/KtPot';
import { loadPots, settleMiniPots } from '@/lib/kt-pots';

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
  // KT game: settle it if the round's locked, then show the pot.
  let pot = null as React.ReactNode;
  if (game.prize?.kt) {
    await settleMiniPots([game.id]);
    const { pots, entries } = await loadPots('mini', [String(game.id)]);
    if (pots[0]) {
      const names = new Map(teams.map((t) => [t.id as number, t.name as string]));
      pot = <KtPotWrap pot={pots[0]} paid={entries.map((e) => e.team_id)} clubs={game.order} myTeamId={me.team_id} commish={!!me.is_commish} names={Object.fromEntries(names)} path={`/live/g/${game.id}`} />;
    }
  }
  if (game.kind === 'cap5') {
    const { ready, entries } = await loadEntries(game.id);
    return <CapGame initialRound={data} game={game} initialEntries={entries} ready={ready} teams={teams} myTeamId={me.team_id} canManage={canManage} pot={pot} />;
  }
  return <GameRoom initialRound={data} initialGame={game} initialPicks={picks} teams={teams} myTeamId={me.team_id} canManage={canManage} pot={pot} />;
}
