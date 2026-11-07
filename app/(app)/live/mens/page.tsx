import { redirect } from 'next/navigation';
import { MensRound } from '@/components/live/mens';
import { getLeague, getMe } from '@/lib/data';
import { buildMensRound } from '@/lib/mens-round';
import { withClubRows } from '@/lib/club-rounds';

export const metadata = { title: 'Men’s Round 1 (test)' };
export const dynamic = 'force-dynamic';

export default async function MensRoundPage() {
  const me = await getMe();
  if (!me) redirect('/');
  const league = await getLeague();
  return <MensRound round={withClubRows(buildMensRound(league))} myTeamId={me.team_id} />;
}
