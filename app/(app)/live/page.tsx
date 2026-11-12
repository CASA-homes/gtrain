import { Matchday } from '@/components/live/matchday';
import { getLeague, getMe } from '@/lib/data';
import { buildCup } from '@/lib/cup-data';
import { buildMatchday } from '@/lib/matchday-data';
import { myMinis } from '@/lib/minis';
import { buildMensRound } from '@/lib/mens-round';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Matchday' };
export const dynamic = 'force-dynamic';

export default async function MatchdayPage() {
  const me = await getMe();
  if (!me) redirect('/');
  const league = await getLeague();
  const cup = await buildCup(league, me.team_id);
  const [data, minis] = await Promise.all([buildMatchday(league, me.team_id, cup), myMinis(league, me.team_id)]);
  // Live scores for the phone list: your players in this round's (simulated) men's games, same as Live Matchups.
  const mens = buildMensRound(league);
  const mine = mens.teams.find((t) => t.id === me.team_id);
  const liveSrc = mine ? { now: Date.parse(mens.now), games: mens.games, players: mine.players.map(({ prof: _p, ...p }) => ({ ...p, prof: { pos: [], age: null, avg: null, games: null, log: [], box: null, hist: [] } })) } : null;
  return <Matchday data={data} cup={cup} minis={minis} liveSrc={liveSrc} />;
}
