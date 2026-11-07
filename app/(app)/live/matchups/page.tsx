import { redirect } from 'next/navigation';
import { LiveMatchups } from '@/components/live/live-matchups';
import { getLeague, getMe } from '@/lib/data';
import { buildMensRound } from '@/lib/mens-round';
import { withClubRows } from '@/lib/club-rounds';
import { buildCup } from '@/lib/cup-data';
import { buildMatchday } from '@/lib/matchday-data';
import { HISTORY_ROUNDS, HISTORY_SEASON, buildHistoryRound, roundName } from '@/lib/history';

export const metadata = { title: 'Live Matchups' };
export const dynamic = 'force-dynamic';

export default async function MatchupsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/');
  const { r } = await searchParams;
  const league = await getLeague();
  const cup = await buildCup(league, me.team_id);
  const md = await buildMatchday(league, me.team_id, cup);
  const rounds = [
    { value: `2027-${md.round}`, label: `Round ${md.round} · this week`, group: '2027' },
    ...[...HISTORY_ROUNDS].reverse().map((n) => ({ value: `${HISTORY_SEASON}-${n}`, label: `${roundName(n)} · completed`, group: String(HISTORY_SEASON) })),
  ];
  const m = /^(\d{4})-(\d{1,2})$/.exec(r ?? '');
  const hist = m && Number(m[1]) === HISTORY_SEASON && HISTORY_ROUNDS.includes(Number(m[2])) ? buildHistoryRound(Number(m[2]), league, me.team_id) : null;
  const sel = hist ? `${HISTORY_SEASON}-${hist.round}` : rounds[0].value;
  return <LiveMatchups mens={withClubRows(buildMensRound(league))} md={md} rounds={rounds} sel={sel} history={hist} />;
}
