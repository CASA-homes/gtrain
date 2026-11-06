import { redirect } from 'next/navigation';
import { RatherGame } from '@/components/RatherGame';
import { getLeague, getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { buildItems, valuesFor, type Vote } from '@/lib/values';

export const metadata = { title: 'Who’d you rather' };
export const dynamic = 'force-dynamic';

export default async function RatherPage() {
  const me = await getMe();
  if (!me) redirect('/');
  const supabase = await createClient();
  const [league, vq] = await Promise.all([getLeague(), supabase.from('value_votes').select('voter_id, mode, a_id, b_id, winner, created_at').order('id').limit(50000)]);
  const votes = (vq.data ?? []) as Vote[];
  const items = buildItems(league);
  return (
    <RatherGame
      ready={!vq.error} items={items} myTeamId={me.team_id}
      values={{ dynasty: valuesFor(items, votes, 'dynasty'), now: valuesFor(items, votes, 'now') }}
      totals={{ votes: votes.length, mine: votes.filter((v) => v.voter_id === me.team_id).length, voters: new Set(votes.map((v) => v.voter_id)).size }}
      teams={league.teams.map((t) => ({ id: t.id, short: t.short_code }))}
    />
  );
}
