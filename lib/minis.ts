// Your mini games this week, for the Squad Selector lineups panel and the Live Matchups tabs.
// A mini game lasts one round: "this week" is the newest round any game has been set up for.
import { listGames } from '@/app/(app)/live/actions';
import type { League } from '@/lib/data';

export interface MiniLink { id: number; name: string; sub: string; status: 'drafting' | 'done' }
export async function myMinis(league: League, myTeamId: number): Promise<MiniLink[]> {
  const { ready, games } = await listGames().catch(() => ({ ready: false, games: [] as Awaited<ReturnType<typeof listGames>>['games'] }));
  if (!ready || !games.length) return [];
  const round = Math.max(...games.map((g) => g.round));
  const name = (id: number) => league.teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  return games.filter((g) => g.round === round && g.order.includes(myTeamId)).map((g) => ({
    id: g.id, name: g.name, status: g.status,
    sub: g.order.length === 2 ? `v ${name(g.order.find((t) => t !== myTeamId) ?? 0)}` : `${g.order.length} clubs`,
  }));
}
