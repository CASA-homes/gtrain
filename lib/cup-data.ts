// Server-side assembly of the cup for a signed-in club.
import type { League } from '@/lib/data';
import { projected2027 } from '@/lib/projection';
import { conferences, cupAutoFill, cupFixture, cupTies, resolveKnockouts, type CupLineup } from '@/lib/cup';
import { loadCupData } from '@/app/(app)/live/cup-actions';
import type { CupData, CupH2H, CupPerson } from '@/components/live/cup';

export async function buildCup(league: League, myTeamId: number): Promise<CupData> {
  const ladder = league.ladder.filter((l) => l.season === 2026).sort((a, b) => a.rank - b.rank).map((l) => l.team_id);
  const order = [...ladder, ...league.teams.map((t) => t.id).filter((id) => !ladder.includes(id))].slice(0, 10);
  const confs = conferences(order);
  const { matches: raw, byes } = cupFixture(confs);
  const { ready, lineups, results, all } = await loadCupData(myTeamId);
  const ties = cupTies(all, raw, results);
  const matches = resolveKnockouts(raw, confs, results);
  const listOf = (team: number) => league.players.filter((p) => p.team_id === team && !p.list_status)
    .map((p) => ({ id: p.id, name: p.full_name ?? p.name, pos: [...p.positions], club: p.afl_club, proj: Math.round(projected2027(p)), a26: p.average, keeper: p.is_keeper || p.is_rookie_keeper }));
  const squad = listOf(myTeamId);

  // Your next cup game, head to head: your saved (or last) cup team against theirs, their last one, or their best guess.
  const done = new Set(results.map((r) => r.match_id));
  const next = matches.find((m) => (m.home === myTeamId || m.away === myTeamId) && !done.has(m.id));
  let h2h: CupH2H | null = null;
  const people: Record<number, CupPerson> = {};
  if (next) {
    const opp = next.home === myTeamId ? next.away : next.home;
    const rowsOf = (t: number) => all.filter((r) => r.team_id === t).sort((a, b) => b.cup_round - a.cup_round);
    const pick = (t: number, list: ReturnType<typeof listOf>): { lineup: CupLineup; source: 'saved' | 'last' | 'assumed' } => {
      const rows = rowsOf(t), exact = rows.find((r) => r.cup_round === next.round), last = rows.find((r) => r.cup_round < next.round);
      if (exact) return { lineup: exact.lineup, source: 'saved' };
      if (last) return { lineup: last.lineup, source: 'last' };
      return { lineup: cupAutoFill(list, new Set(Object.entries(ties).filter(([, tm]) => tm !== t).map(([id]) => Number(id)))), source: 'assumed' };
    };
    const mine = pick(myTeamId, squad);
    for (const p of squad) people[p.id] = { name: p.name, pos: p.pos, proj: p.proj, club: p.club };
    let theirs = null;
    if (opp != null) {
      const ol = listOf(opp);
      for (const p of ol) people[p.id] = { name: p.name, pos: p.pos, proj: p.proj, club: p.club };
      theirs = { teamId: opp, ...pick(opp, ol) };
    }
    h2h = { matchId: next.id, round: next.round, stage: next.stage, mine, theirs };
  }
  return { ready, confs, matches, byes, results, teams: league.teams.map((t) => ({ id: t.id, name: t.name, short: t.short_code })), myTeamId, lineups, squad, ties, h2h, people };
}
