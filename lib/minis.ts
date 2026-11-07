// Your mini games this week, for the Squad Selector lineups panel and the Live Matchups tabs.
// A mini game lasts one round; once that round is completed it's a past result and drops off.
import { listGames } from '@/app/(app)/live/actions';
import type { League } from '@/lib/data';
import { liveRound } from '@/lib/aflw';

export interface MiniLink { id: number; name: string; sub: string; status: 'drafting' | 'done' }
export async function myMinis(league: League, myTeamId: number): Promise<MiniLink[]> {
  const { ready, games } = await listGames().catch(() => ({ ready: false, games: [] as Awaited<ReturnType<typeof listGames>>['games'] }));
  if (!ready || !games.length) return [];
  // Only games whose round hasn't finished are "this week"; anything from a completed round is a past result.
  let open = new Set<number>();
  try { const lr = await liveRound(); open = new Set(lr.rounds.filter((r) => r.status !== 'completed').map((r) => r.n)); } catch { return []; }
  const live = games.filter((g) => open.has(g.round));
  if (!live.length) return [];
  const round = Math.min(...live.map((g) => g.round));
  const name = (id: number) => league.teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  return games.filter((g) => g.round === round && g.order.includes(myTeamId)).map((g) => ({
    id: g.id, name: g.name, status: g.status,
    sub: g.order.length === 2 ? `v ${name(g.order.find((t) => t !== myTeamId) ?? 0)}` : `${g.order.length} clubs`,
  }));
}
