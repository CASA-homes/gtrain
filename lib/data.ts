import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  best22, best18Total, buildRatings, primaryLine, statusFromRank, LINES,
  type Best22, type Line, type PlayerRow, type Ratings, type Status,
} from '@/lib/ratings';

export const CURRENT_SEASON = 2026;

export interface Team {
  id: number; name: string; coach_name: string; short_code: string; keeper_id: number | null;
}
export interface Me { user_id: string; email: string; team_id: number; is_commish: boolean; display_name: string | null }

export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('members').select('*').eq('user_id', user.id).maybeSingle();
  return data as Me | null;
});

export interface TeamAnalysis {
  team: Team;
  players: PlayerRow[];
  best: Best22;
  best18: number;
  rank: number;              // by Best 18 total
  status: Status;
  lineStrength: Record<Line, { score: number; rank: number }>;
  premierships: number[];
}

export interface League {
  teams: Team[];
  players: PlayerRow[];
  ratings: Map<number, Ratings>;
  byTeam: Map<number, TeamAnalysis>;
  seasons: { year: number; premier_id: number; runner_up_id: number; spoon_id: number; medal: string | null; gf_winner_score: number | null; gf_loser_score: number | null }[];
  ladder: { season: number; team_id: number; rank: number; wins: number; losses: number; draws: number; points: number; pts_for: number; pts_against: number }[];
}

/** Everything the clubhouse, player and league pages need, in one round trip per table. */
export const getLeague = cache(async (): Promise<League> => {
  const supabase = await createClient();
  const [teamsQ, squadQ, seasonsQ, ladderQ] = await Promise.all([
    supabase.from('teams').select('id,name,coach_name,short_code,keeper_id').order('id'),
    supabase.from('squad').select(`
      team_id, is_keeper, is_rookie_keeper,
      players!inner ( id, name, positions, afl_club, birth_date, draft_pick,
        player_seasons ( season, games, average, last5, status ) )`),
    supabase.from('seasons').select('*').order('year', { ascending: false }),
    supabase.from('ladder').select('*').order('rank'),
  ]);

  const teams = (teamsQ.data ?? []) as Team[];
  type SquadRow = {
    team_id: number; is_keeper: boolean; is_rookie_keeper: boolean;
    players: { id: number; name: string; positions: Line[]; afl_club: string | null; birth_date: string | null; draft_pick: number | null;
      player_seasons: { season: number; games: number | null; average: number | null; last5: (number | null)[] | null; status: string | null }[] };
  };
  const players: PlayerRow[] = ((squadQ.data ?? []) as unknown as SquadRow[]).map((s) => {
    const cur = s.players.player_seasons.find((x) => x.season === CURRENT_SEASON);
    return {
      id: s.players.id, name: s.players.name, positions: s.players.positions, afl_club: s.players.afl_club,
      birth_date: s.players.birth_date, draft_pick: s.players.draft_pick,
      team_id: s.team_id, is_keeper: s.is_keeper, is_rookie_keeper: s.is_rookie_keeper,
      games: cur?.games ?? null, average: cur?.average != null ? Number(cur.average) : null,
      last5: cur?.last5 ?? [], status: cur?.status ?? null,
    };
  });

  const ratings = buildRatings(players);
  const seasons = (seasonsQ.data ?? []) as League['seasons'];

  const analyses = teams.map((team) => {
    const ps = players.filter((p) => p.team_id === team.id);
    const best = best22(ps);
    return { team, players: ps, best, best18: best18Total(best) };
  });
  const order = [...analyses].sort((a, b) => b.best18 - a.best18);

  // Line strength: sum of the line's starters, ranked across the league.
  const lineScores = new Map<number, Record<Line, number>>();
  for (const a of analyses) {
    lineScores.set(a.team.id, Object.fromEntries(LINES.map((l) => [l, a.best.lines[l].reduce((s, p) => s + (p.average ?? 0), 0)])) as Record<Line, number>);
  }
  const byTeam = new Map<number, TeamAnalysis>();
  for (const a of analyses) {
    const rank = order.findIndex((o) => o.team.id === a.team.id) + 1;
    const ls = {} as TeamAnalysis['lineStrength'];
    for (const l of LINES) {
      const all = analyses.map((x) => lineScores.get(x.team.id)![l]).sort((p, q) => q - p);
      const mine = lineScores.get(a.team.id)![l];
      const top = all[0] || 1;
      ls[l] = { score: Math.max(1, Math.round((mine / top) * 20)), rank: all.indexOf(mine) + 1 };
    }
    byTeam.set(a.team.id, {
      ...a, rank, status: statusFromRank(rank), lineStrength: ls,
      premierships: seasons.filter((s) => s.premier_id === a.team.id).map((s) => s.year).sort(),
    });
  }

  return { teams, players, ratings, byTeam, seasons, ladder: (ladderQ.data ?? []) as League['ladder'] };
});

export { primaryLine };
