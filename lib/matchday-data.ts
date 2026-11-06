// Server-side assembly of Matchday for a signed-in club: every game they're in this round, their saved lineups,
// and enough of each opponent to draw the matchup.
import type { League } from '@/lib/data';
import type { PlayerRow } from '@/lib/ratings';
import { projected2027 } from '@/lib/projection';
import { photoUrl } from '@/lib/photos';
import { createClient } from '@/lib/supabase/server';
import { buildMensRound } from '@/lib/mens-round';
import { CUP_SEASON, type CupLineup } from '@/lib/cup';
import { COMP_BY_KEY, COMP_SEASON, type CompKey } from '@/lib/comps';
import { RULES, ageOn, autoFill, type GameKey, type MdLineup, type MdPlayer, type Pos } from '@/lib/matchday';
import type { CupData } from '@/components/live/cup';

/** G-Train round on Matchday. Pre-season this is round 1 of 2027 against the test draw. */
export const MATCHDAY_ROUND = 1;
export const PLATE_ROUNDS = [13, 15, 17, 19];

export interface Side { teamId: number; name: string; short: string; lineup: MdLineup; saved: boolean }
export interface GameOpt {
  id: string; key: GameKey; round: number; label: string; sub: string;
  /** a head-to-head opponent, or a table of every entrant for season-long comps */
  opp: Side | null; table?: Side[]; note?: string;
}
export interface MatchdayData {
  season: number; round: number; myTeamId: number; myName: string; ready: boolean;
  squad: MdPlayer[]; pool: MdPlayer[]; others: Record<number, MdPlayer>;
  games: GameOpt[]; lineups: Record<string, MdLineup | null>;
  survivorUsed: number[]; entered: CompKey[];
}

export const toMd = (p: PlayerRow): MdPlayer => ({
  id: p.id, name: p.full_name ?? p.name, pos: [...p.positions] as Pos[], club: p.afl_club, proj: Math.round(projected2027(p) || 0),
  age: ageOn(p.birth_date), rookie: p.is_rookie_keeper, photo: photoUrl(p),
});
const fromCup = (l: CupLineup | undefined): MdLineup | null => (l ? { slots: Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v ?? []])) } : null);

export async function buildMatchday(league: League, myTeamId: number, cup: CupData): Promise<MatchdayData> {
  const supabase = await createClient();
  const listOf = (team: number) => league.players.filter((p) => p.team_id === team && !p.list_status).map(toMd);
  const squad = listOf(myTeamId);
  const team = (id: number) => league.teams.find((t) => t.id === id);
  const round = MATCHDAY_ROUND;

  const [gl, ce, cl] = await Promise.all([
    supabase.from('game_lineups').select('comp, round, team_id, lineup').eq('season', COMP_SEASON),
    supabase.from('comp_entries').select('comp, team_id').eq('season', COMP_SEASON),
    supabase.from('cup_lineups').select('cup_round, team_id, lineup').eq('season', CUP_SEASON),
  ]);
  const ready = !gl.error && !ce.error;
  const saved = new Map<string, MdLineup>();
  for (const r of gl.data ?? []) saved.set(`${r.comp}:${r.round}:${r.team_id}`, r.lineup as MdLineup);
  for (const r of cl.data ?? []) { const l = fromCup(r.lineup as CupLineup); if (l) saved.set(`cup:${r.cup_round}:${r.team_id}`, l); }
  const entries = (ce.data ?? []) as { comp: CompKey; team_id: number }[];
  const entered = entries.filter((e) => e.team_id === myTeamId).map((e) => e.comp);
  const others: Record<number, MdPlayer> = {};
  const side = (key: GameKey, rnd: number, teamId: number): Side => {
    const t = team(teamId);
    const own = saved.get(`${key}:${rnd}:${teamId}`);
    const list = listOf(teamId);
    if (teamId !== myTeamId) for (const p of list) others[p.id] = p;
    return { teamId, name: t?.name ?? `Club ${teamId}`, short: t?.short_code ?? '?', lineup: own ?? autoFill(RULES[key], list), saved: !!own };
  };

  const games: GameOpt[] = [];
  const lineups: Record<string, MdLineup | null> = {};

  // G-Train: the test draw for round 1 (seeded, same as the men's matchday test) until the 2027 fixture is loaded.
  const mens = buildMensRound(league);
  const mu = mens.matchups.find((m) => m.includes(myTeamId));
  const gOpp = mu ? (mu[0] === myTeamId ? mu[1] : mu[0]) : null;
  games.push({ id: `gtrain:${round}`, key: 'gtrain', round, label: `G-Train · Round ${round}`, sub: gOpp ? `v ${team(gOpp)?.name}` : 'No game',
    opp: gOpp ? side('gtrain', round, gOpp) : null, note: 'Round 1 opponent is from the test draw until the 2027 fixture is set.' });
  lineups[`gtrain:${round}`] = saved.get(`gtrain:${round}:${myTeamId}`) ?? null;

  // Knockout Cup: your next unplayed cup game.
  const played = new Set(cup.results.map((r) => r.match_id));
  const next = cup.matches.find((m) => (m.home === myTeamId || m.away === myTeamId) && !played.has(m.id))
    ?? cup.matches.find((m) => m.stage !== 'group' && !played.has(m.id));
  if (next) {
    const opp = next.home === myTeamId ? next.away : next.away === myTeamId ? next.home : null;
    games.push({ id: `cup:${next.round}`, key: 'cup', round: next.round,
      label: `Knockout Cup · Round ${next.round}`, sub: opp ? `v ${team(opp)?.name}` : next.label ?? 'TBC',
      opp: opp ? side('cup', next.round, opp) : null, note: next.stage === 'group' ? 'Group game' : next.stage === 'semi' ? 'Semi-final' : 'Final' });
    lineups[`cup:${next.round}`] = saved.get(`cup:${next.round}:${myTeamId}`)
      ?? [...cup.matches.map((m) => m.round)].filter((r) => r < next.round).reverse().map((r) => saved.get(`cup:${r}:${myTeamId}`)).find(Boolean) ?? null;
  }

  // Opt-in comps you've entered.
  const entrants = (c: CompKey) => entries.filter((e) => e.comp === c).map((e) => e.team_id);
  if (entered.includes('shield')) {
    games.push({ id: `shield:${round}`, key: 'shield', round, label: `Rookie Shield · Round ${round}`, sub: `${entrants('shield').length} in`,
      opp: null, table: entrants('shield').map((t) => side('shield', round, t)) });
    lineups[`shield:${round}`] = saved.get(`shield:${round}:${myTeamId}`) ?? null;
  }
  let survivorUsed: number[] = [];
  let pool: MdPlayer[] = [];
  if (entered.includes('survivor')) {
    survivorUsed = [...saved.entries()].filter(([k]) => k.startsWith('survivor:') && k.endsWith(`:${myTeamId}`) && !k.startsWith(`survivor:${round}:`))
      .flatMap(([, l]) => l.slots.PICK ?? []);
    pool = [...league.players.filter((p) => !p.list_status), ...league.freeAgents].map(toMd).filter((p) => p.proj >= 70).sort((a, b) => b.proj - a.proj);
    games.push({ id: `survivor:${round}`, key: 'survivor', round, label: `Survivor · Round ${round}`, sub: `${entrants('survivor').length} alive`,
      opp: null, table: entrants('survivor').map((t) => { const s = side('survivor', round, t); if (!s.saved) s.lineup = { slots: { PICK: [] } }; return s; }) });
    for (const p of pool) others[p.id] ??= p;
    lineups[`survivor:${round}`] = saved.get(`survivor:${round}:${myTeamId}`) ?? null;
  }
  if (entered.includes('plate')) {
    const r = PLATE_ROUNDS[0];
    games.push({ id: `plate:${r}`, key: 'plate', round: r, label: `The Plate · Round ${r}`, sub: 'Starts after the Cup groups', opp: null,
      table: entrants('plate').map((t) => side('plate', r, t)), note: `Only counts if you miss the Cup semis. ${COMP_BY_KEY.plate.rounds}.` });
    lineups[`plate:${r}`] = saved.get(`plate:${r}:${myTeamId}`) ?? null;
  }

  return { season: COMP_SEASON, round, myTeamId, myName: team(myTeamId)?.name ?? '', ready, squad, pool, others, games, lineups, survivorUsed, entered };
}
