import { LiveHome, type Assets } from '@/components/live/battle';
import { getLeague } from '@/lib/data';
import { buildMensRound } from '@/lib/mens-round';
import { buildCup } from '@/lib/cup-data';
import { listGames } from './actions';
import { loadDesk } from './battle-actions';
import { FeedDown } from './FeedDown';
import { loadLive } from './load';

export const metadata = { title: 'Live Matchups' };
export const dynamic = 'force-dynamic';

export default async function LiveHomePage() {
  const { me, teams, data, error } = await loadLive();
  if (!data) return <FeedDown error={error} />;
  const [{ ready, games }, league, desk] = await Promise.all([listGames(), getLeague(), loadDesk()]);
  const cup = await buildCup(league, me.team_id);
  const club = (id: number) => league.teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const assets: Assets = {
    picks: league.picks.map((p) => ({ id: p.id, owner: p.owner_team_id, label: `${p.year} R${p.round}${p.overall ? ` #${p.overall}` : ''}${p.original_team_id !== p.owner_team_id ? ` (via ${club(p.original_team_id)})` : ''}` })),
    players: league.players.filter((p) => p.team_id && !p.list_status).map((p) => ({ id: p.id, team: p.team_id, name: p.full_name ?? p.name })),
  };
  return <LiveHome initial={data} games={games} ready={ready} teams={teams.filter((t) => league.teams.some((x) => x.id === t.id))} myTeamId={me.team_id} isCommish={me.is_commish} mens={buildMensRound(league)} desk={desk} assets={assets} cup={cup} />;
}
