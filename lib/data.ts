import { positionsFor } from '@/lib/position-overrides';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import freeAgentData from '@/lib/free-agent-players.json';
import { buildAttrs, type Attr } from '@/lib/scouting';
import { FUTURE_CORE, FUTURE_PIN, FUTURE_MAX_AGE, FUTURE_PICKS, prospectScore, futureScore, lineTotals, simulate2027, type Projection } from '@/lib/projection';
const isFutureAge = (p: PlayerRow) => { const a = age(p.birth_date); return a != null && a <= FUTURE_MAX_AGE; };
import {
  age, best22, best18Total, savedLineup, buildRatings, primaryLine, statusFromRank, LINES,
  type Best22, type Box, type GameLog, type Hist, type Line, type PlayerRow, type Slot, type Ratings, type Status,
} from '@/lib/ratings';

export const CURRENT_SEASON = 2026;

// Every player nobody in the league owns, from the Keeper board with full DFS stats (scripts/fa-pull.py → fa-build.py).
type FARow = Omit<PlayerRow, 'team_id' | 'is_keeper' | 'is_rookie_keeper' | 'photo_path' | 'list_status' | 'lineup'> & { owned_pct: string };
const FA_ROWS = (freeAgentData as unknown as { updated: string; players: FARow[] }).players;
export const FREE_AGENTS_UPDATED = (freeAgentData as unknown as { updated: string }).updated;

export interface Team {
  id: number; name: string; coach_name: string; short_code: string; keeper_id: number | null; status_override: Status | null;
}
export interface Pick { id: number; year: number; round: number; overall: number | null; original_team_id: number; owner_team_id: number; is_optional: boolean }
export interface Me { user_id: string; email: string; team_id: number; is_commish: boolean; display_name: string | null; is_guest?: boolean }

export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('members').select('*').eq('user_id', user.id).maybeSingle();
  if (!data) return null;
  // Guests (no G-Train club) sign in with a guest club so they can play the Live Matchups mini games.
  const t = await supabase.from('teams').select('is_guest').eq('id', data.team_id).maybeSingle();
  return { ...(data as Me), is_guest: !t.error && !!t.data?.is_guest };
});

/** The signed-in coach, or null for guests: league actions (trades, keepers, news) use this so guests can only look. */
export const getCoach = cache(async (): Promise<Me | null> => {
  const me = await getMe();
  return me && !me.is_guest ? me : null;
});

export interface TeamAnalysis {
  team: Team;
  players: PlayerRow[];
  best: Best22;              // auto-picked, used for rankings
  lineup: Best22;            // what the coach has set (falls back to best)
  lineupSaved: boolean;
  best18: number;
  rank: number;              // by Best 18 total
  status: Status;
  lineStrength: Record<Line, { score: number; rank: number }>;
  premierships: number[];
  projection: Projection;          // 2027: keepers + simulated redraft
  projectedStatus: Status;         // what the model says
  future: { score: number; rank: number; avgAge: number | null; avgPotential: number | null; lines: Record<Line, number>; picks: number[] };  // lines = league rank per line
}

export interface League {
  teams: Team[];
  players: PlayerRow[];
  /** Unowned players. team_id is 0. Rated against the rostered pool without changing it. */
  freeAgents: PlayerRow[];
  ownedPct: Map<number, string>;
  ratings: Map<number, Ratings>;
  attrs: Map<number, Attr[]>;
  byTeam: Map<number, TeamAnalysis>;
  seasons: { year: number; premier_id: number; runner_up_id: number; spoon_id: number; medal: string | null; gf_winner_score: number | null; gf_loser_score: number | null }[];
  picks: Pick[];
  ladder: { season: number; team_id: number; rank: number; wins: number; losses: number; draws: number; points: number; pts_for: number; pts_against: number }[];
}

/** Everything the clubhouse, player and league pages need, in one round trip per table. */
export const getLeague = cache(async (): Promise<League> => {
  const supabase = await createClient();
  const [teamsQ, squadQ, seasonsQ, ladderQ, picksQ] = await Promise.all([
    supabase.from('teams').select('id,name,coach_name,short_code,keeper_id,status_override,is_guest').order('id').then((r) =>
      r.error ? supabase.from('teams').select('id,name,coach_name,short_code,keeper_id,status_override').order('id') : { ...r, data: (r.data ?? []).filter((t) => !t.is_guest) }),
    supabase.from('squad').select(`
      team_id, is_keeper, is_rookie_keeper, lineup,
      players!inner ( id, name, full_name, positions, afl_club, birth_date, draft_pick, draft_year, dfs_id, height_cm, debut_year, career_games, hist, photo_path, list_status,
        player_seasons ( season, games, average, last5, status, box, games_log ) )`),
    supabase.from('seasons').select('*').order('year', { ascending: false }),
    supabase.from('ladder').select('*').order('rank'),
    supabase.from('picks').select('id, year, round, overall, original_team_id, owner_team_id, is_optional').in('year', [CURRENT_SEASON + 1, CURRENT_SEASON + 2]).order('year').order('round').order('overall').order('id'),
  ]);
  const picks = (picksQ.data ?? []) as Pick[];

  const teams = (teamsQ.data ?? []) as Team[];
  type SquadRow = {
    team_id: number; is_keeper: boolean; is_rookie_keeper: boolean; lineup: Slot | null;
    players: { id: number; name: string; full_name: string | null; positions: Line[]; afl_club: string | null; birth_date: string | null;
      draft_pick: number | null; draft_year: number | null; dfs_id: string | null; height_cm: number | null; debut_year: number | null; career_games: number | null; hist: Hist[] | null; photo_path: string | null; list_status: string | null;
      player_seasons: { season: number; games: number | null; average: number | null; last5: (number | null)[] | null; status: string | null; box: Box | null; games_log?: GameLog[] | null }[] };
  };
  const players: PlayerRow[] = ((squadQ.data ?? []) as unknown as SquadRow[]).map((s) => {
    const cur = s.players.player_seasons.find((x) => x.season === CURRENT_SEASON);
    return {
      id: s.players.id, name: s.players.name, positions: positionsFor(s.players.full_name, s.players.positions), afl_club: s.players.afl_club,
      birth_date: s.players.birth_date, draft_pick: s.players.draft_pick, draft_year: s.players.draft_year,
      full_name: s.players.full_name, dfs_id: s.players.dfs_id, height_cm: s.players.height_cm,
      debut_year: s.players.debut_year, career_games: s.players.career_games, hist: s.players.hist, photo_path: s.players.photo_path, list_status: s.players.list_status, box: cur?.box ?? null, games_log: cur?.games_log ?? null, lineup: s.lineup ?? null,
      team_id: s.team_id, is_keeper: s.is_keeper, is_rookie_keeper: s.is_rookie_keeper,
      games: cur?.games ?? null, average: cur?.average != null ? Number(cur.average) : null,
      last5: cur?.last5 ?? [], status: cur?.status ?? null,
    };
  });

  const rosteredIds = new Set(players.map((p) => p.dfs_id).filter(Boolean));
  const freeAgents: PlayerRow[] = FA_ROWS.filter((f) => !f.dfs_id || !rosteredIds.has(f.dfs_id)).map(({ owned_pct: _o, ...f }) => ({
    ...f, team_id: 0, is_keeper: false, is_rookie_keeper: false, photo_path: null, list_status: null, lineup: null,
  }));
  const ownedPct = new Map(FA_ROWS.map((f) => [f.id, f.owned_pct]));
  const ratings = buildRatings(players, freeAgents);
  const seasons = (seasonsQ.data ?? []) as League['seasons'];

  const analyses = teams.map((team) => {
    const ps = players.filter((p) => p.team_id === team.id);
    const best = best22(ps);
    return { team, players: ps, best, lineup: savedLineup(ps) ?? best, lineupSaved: !!savedLineup(ps), best18: best18Total(best) };
  });
  const order = [...analyses].sort((a, b) => b.best18 - a.best18);

  // Line strength: sum of the line's starters, ranked across the league.
  const lineScores = new Map<number, Record<Line, number>>();
  for (const a of analyses) {
    lineScores.set(a.team.id, Object.fromEntries(LINES.map((l) => [l, a.best.lines[l].reduce((s, p) => s + (p.average ?? 0), 0)])) as Record<Line, number>);
  }
  const projection = simulate2027(players, teams.map((t) => t.id),
    picks.filter((p) => p.year === CURRENT_SEASON + 1 && p.overall != null) as { overall: number; owner_team_id: number }[]);
  // Future build: only players aged 24 or under count. Each team's best six of them, plus line-by-line strength on future scores.
  const futureByTeam = teams.map((t) => {
    const mine = players.filter((p) => p.team_id === t.id && isFutureAge(p))
      .map((p) => ({ p, f: futureScore(p, ratings.get(p.id)?.potential ?? null, ratings.get(p.id)?.lineBonus ?? 0, ratings.get(p.id)?.lineEdge ?? 0) }))
      .sort((x, y) => y.f - x.f);
    // Best two 2027 picks join the pool as prospects before taking the best six.
    const prospects = picks.filter((pk) => pk.year === CURRENT_SEASON + 1 && pk.owner_team_id === t.id && pk.overall)
      .map((pk) => ({ overall: pk.overall!, f: prospectScore(pk.overall!) })).sort((x, y) => y.f - x.f).slice(0, FUTURE_PICKS);
    const core = mine.slice(0, FUTURE_CORE);
    const pool = [...mine.map((x) => x.f), ...prospects.map((x) => x.f)].sort((x, y) => y - x).slice(0, FUTURE_CORE);
    const countedPicks = prospects.filter((x) => pool.includes(x.f)).map((x) => x.overall);
    const ages = core.map((x) => age(x.p.birth_date)).filter((x): x is number => x != null);
    const pots = core.map((x) => ratings.get(x.p.id)?.potential).filter((x): x is number => x != null);
    return {
      id: t.id,
      name: t.name,
      score: pool.reduce((s2, x) => s2 + x, 0),
      picks: countedPicks,
      avgAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
      avgPotential: pots.length ? pots.reduce((a, b) => a + b, 0) / pots.length : null,
      lineTotals: lineTotals(mine.map((x) => ({ id: x.p.id, positions: x.p.positions, score: x.f }))),
    };
  }).sort((x, y) => y.score - x.score);
  // Commish calls: pin a team to a set spot in the future build.
  for (const [team, spot] of Object.entries(FUTURE_PIN)) {
    const i = futureByTeam.findIndex((f) => f.name === team);
    if (i >= 0) futureByTeam.splice(spot - 1, 0, ...futureByTeam.splice(i, 1));
  }
  const futureLineRank = (id: number, l: Line) => {
    const all = futureByTeam.map((f) => f.lineTotals[l]).sort((x, y) => y - x);
    return all.indexOf(futureByTeam.find((f) => f.id === id)!.lineTotals[l]) + 1;
  };

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
    const proj = projection.get(a.team.id)!;
    const projectedStatus = statusFromRank(proj.rank);
    byTeam.set(a.team.id, {
      ...a, rank, status: a.team.status_override ?? projectedStatus, projectedStatus, projection: proj,
      future: (() => {
        const f = futureByTeam.find((x) => x.id === a.team.id)!;
        return {
          score: Math.round(f.score), rank: futureByTeam.indexOf(f) + 1, avgAge: f.avgAge, avgPotential: f.avgPotential, picks: f.picks,
          lines: Object.fromEntries(LINES.map((l) => [l, futureLineRank(a.team.id, l)])) as Record<Line, number>,
        };
      })(),
      lineStrength: ls,
      premierships: seasons.filter((s) => s.premier_id === a.team.id).map((s) => s.year).sort(),
    });
  }

  const attrs = buildAttrs(players, freeAgents);
  return { teams, players, freeAgents, ownedPct, ratings, attrs, byTeam, picks, seasons, ladder: (ladderQ.data ?? []) as League['ladder'] };
});

export { primaryLine };
