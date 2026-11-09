import { redirect } from 'next/navigation';
import { DraftRoom } from '@/components/draft/DraftRoom';
import { getLeague, getMe } from '@/lib/data';
import { loadRoomState, roomPool, roomTeams } from '@/lib/draft-room-data';

export const metadata = { title: 'Draft Room' };
export const dynamic = 'force-dynamic';

export default async function DraftRoomPage() {
  const me = await getMe();
  if (!me) redirect('/');
  const [league, { ready, state }] = await Promise.all([getLeague(), loadRoomState()]);
  const teams = roomTeams(league);
  const mine = teams.find((t) => t.id === me.team_id);
  const first = (me.display_name ?? mine?.coach ?? 'coach').split(' ')[0];
  return (
    <div style={{ padding: '12px max(12px, env(safe-area-inset-left))' }}>
      <DraftRoom teams={teams} pool={roomPool(league)} initial={state} ready={ready}
        me={{ team_id: mine ? me.team_id : null, is_commish: me.is_commish, first }} />
    </div>
  );
}
