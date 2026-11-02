// Server-side assembly of the cup for a signed-in club.
import type { League } from '@/lib/data';
import { projected2027 } from '@/lib/projection';
import { conferences, cupFixture, resolveKnockouts } from '@/lib/cup';
import { loadCupData } from '@/app/(app)/live/cup-actions';
import type { CupData } from '@/components/live/cup';

export async function buildCup(league: League, myTeamId: number): Promise<CupData> {
  const ladder = league.ladder.filter((l) => l.season === 2026).sort((a, b) => a.rank - b.rank).map((l) => l.team_id);
  const order = [...ladder, ...league.teams.map((t) => t.id).filter((id) => !ladder.includes(id))].slice(0, 10);
  const confs = conferences(order);
  const { matches, byes } = cupFixture(confs);
  const { ready, lineups, results } = await loadCupData(myTeamId);
  const squad = league.players.filter((p) => p.team_id === myTeamId && !p.list_status)
    .map((p) => ({ id: p.id, name: p.full_name ?? p.name, pos: [...p.positions], club: p.afl_club, proj: Math.round(projected2027(p)), a26: p.average, keeper: p.is_keeper || p.is_rookie_keeper }));
  return { ready, confs, matches: resolveKnockouts(matches, confs, results), byes, results, teams: league.teams.map((t) => ({ id: t.id, name: t.name, short: t.short_code })), myTeamId, lineups, squad };
}
