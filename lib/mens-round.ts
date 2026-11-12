// Men's matchday TEST: a mocked G-Train round 1, 2027. The AFL fixture is the real one (released 27 Oct 2026);
// the G-Train pairings are randomised, and every player's score is simulated from his 2027 projection so the
// live views (ratings, TOG, worm) can be designed before the season starts.
import { topFromLogs, type TopPerformer } from '@/lib/top-performer';
import type { League } from '@/lib/data';
import { best22, type PlayerRow } from '@/lib/ratings';
import { projected2027 } from '@/lib/projection';
import { photoUrl } from '@/lib/photos';
import { baseAverage, positionPars, ratingBasis, ratingPos, type PosPars, type RatingBasis } from '@/lib/match-rating';

export interface MGame { id: number; home: string; away: string; start: string; venue: string }
export interface MStats { k: number; h: number; m: number; t: number; g: number; b: number; ho: number }
export interface MPlayer {
  id: number; name: string; club: string; line: 'DEF' | 'MID' | 'RUC' | 'FWD' | 'BENCH'; cap: 'C' | 'VC' | null; photo: string | null;
  proj: number; final: number; path: number[]; injAt: number | null; tog: number; st: MStats;
  prof: MProfile;
  /** what his score is rated against (see lib/match-rating) */
  rb: RatingBasis;
}
/** Condensed profile for the pop-up: 2026 game-by-game scores, season stat line, career by season. */
export interface MProfile {
  pos: string[]; age: number | null; avg: number | null; games: number | null;
  log: [number, number, number | null][];               // [round, score, TOG %] for 2026
  box: { k?: number; h?: number; m?: number; t?: number; g?: number; b?: number; ho?: number; tog?: number; cba?: number; de?: number; cp?: number; cl?: number } | null;
  hist: [number, number, number][];                     // [season, games, average], newest first
  /** rounds he was on the field for his G-Train club (filled in server-side, see lib/club-rounds) */
  club?: import('@/lib/club-rounds').ClubRow[];
}
const ageOf = (d: string | null) => { if (!d) return null; const b = new Date(d), n = new Date(2027, 2, 17); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
export function profileOf(p: PlayerRow): MProfile {
  const b = p.box;
  return {
    pos: p.positions, age: ageOf(p.birth_date), avg: p.average, games: p.games,
    log: (p.games_log ?? []).filter((g) => g[0] != null && g[1] != null).map((g) => [g[0]!, g[1]!, g[2]] as [number, number, number | null]),
    box: b ? { k: b.k, h: b.h, m: b.m, t: b.t, g: b.g, b: b.b, ho: b.ho, tog: b.tog, cba: b.cba, de: b.de, cp: b.cp, cl: b.cl } : null,
    hist: [...(p.hist ?? [])].sort((x, y) => y[0] - x[0]).slice(0, 6),
  };
}
export interface MTeam { id: number; name: string; short: string; coach: string; logo: string | null; colour?: string | null; players: MPlayer[] }
export interface MRound { round: number; season: number; now: string; start: string; end: string; games: MGame[]; teams: MTeam[]; matchups: [number, number][]; top: TopPerformer | null; pars: PosPars }

// Round One 2027 (afl.com.au, 27 Oct 2026). Start times carry the venue's UTC offset.
export const R1_2027: MGame[] = [
  { id: 1, home: 'SYD', away: 'GEE', start: '2027-03-17T19:30:00+11:00', venue: 'SCG' },
  { id: 2, home: 'FRE', away: 'WBD', start: '2027-03-18T17:10:00+08:00', venue: 'Optus Stadium' },
  { id: 3, home: 'HAW', away: 'BRL', start: '2027-03-19T19:40:00+11:00', venue: 'MCG' },
  { id: 4, home: 'RIC', away: 'CAR', start: '2027-03-20T12:35:00+11:00', venue: 'MCG' },
  { id: 5, home: 'ADE', away: 'GWS', start: '2027-03-20T15:45:00+10:30', venue: 'Adelaide Oval' },
  { id: 6, home: 'STK', away: 'COL', start: '2027-03-20T19:40:00+11:00', venue: 'MCG' },
  { id: 7, home: 'NTH', away: 'PTA', start: '2027-03-21T13:10:00+11:00', venue: 'Marvel Stadium' },
  { id: 8, home: 'MEL', away: 'ESS', start: '2027-03-21T15:15:00+11:00', venue: 'MCG' },
  { id: 9, home: 'WCE', away: 'GCS', start: '2027-03-21T15:10:00+08:00', venue: 'Optus Stadium' },
];
export const GAME_MINUTES = 165;   // first bounce to final siren, breaks included

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

function simPlayer(p: PlayerRow, line: MPlayer['line'], cap: MPlayer['cap'], proj: number, pars: PosPars): MPlayer {
  const r = rng(p.id * 7919 + 2027);
  const injured = r() < 0.03;
  const injAt = injured ? 0.15 + r() * 0.6 : null;
  const final = Math.max(8, Math.round(injured ? proj * (injAt! * 0.9) : proj * Math.exp(normal(r) * 0.24)));
  // Score path: 17 points (start + 4 per quarter), shares of the final per quarter with some swing.
  const qs = [0, 1, 2, 3].map(() => 0.55 + r() * 0.9);
  const qt = qs.reduce((a, b) => a + b, 0);
  const path = [0];
  let acc = 0;
  for (let q = 0; q < 4; q++) for (let i = 1; i <= 4; i++) { acc += (qs[q] / qt) / 4 * (0.6 + r() * 0.8); path.push(acc); }
  const top = path[16];
  let norm = path.map((x) => x / top);
  if (injAt != null) norm = norm.map((x, i) => Math.min(1, (i / 16) >= injAt ? 1 : x / injAt * 1));
  const tog = injured ? Math.round(injAt! * 85) : Math.round((line === 'RUC' ? 80 : line === 'MID' ? 76 : 82) + r() * 12);
  // Final stats that add up (roughly) to the AFL Fantasy score: k3 h2 m3 t4 g6 b1 ho1.
  const role = line === 'BENCH' ? (p.positions[0] ?? 'MID') : line;
  const ho = role === 'RUC' ? Math.round(final * (0.24 + r() * 0.1)) : 0;
  const g = Math.max(0, Math.round((final / (role === 'FWD' ? 38 : role === 'MID' ? 140 : role === 'RUC' ? 120 : 400)) * (0.4 + r() * 1.2)));
  const b = Math.max(0, Math.round(g * (0.3 + r() * 0.8) + (role === 'FWD' ? r() * 1.5 : 0)));
  let t = Math.round(final * (role === 'MID' ? 0.05 : 0.033) * (0.6 + r() * 0.8));
  let m = Math.round(final * ({ DEF: 0.075, FWD: 0.065, MID: 0.045, RUC: 0.05 }[role as 'DEF'] ?? 0.05) * (0.7 + r() * 0.6));
  let rest = final - (3 * m + 4 * t + 6 * g + b + ho);
  while (rest < 0 && (m > 0 || t > 0)) { if (m > 0) { m--; rest += 3; } else { t--; rest += 4; } }
  const k = Math.max(0, Math.round((Math.max(0, rest) * (0.55 + r() * 0.15)) / 3));
  const h = Math.max(0, Math.round((Math.max(0, rest) - 3 * k) / 2));
  return { id: p.id, name: p.full_name ?? p.name, club: p.afl_club ?? '', line, cap, photo: photoUrl(p), proj: Math.round(proj), final, path: norm, injAt, tog, st: { k, h, m, t, g, b, ho }, prof: profileOf(p),
    rb: ratingBasis(baseAverage({ prevAvg: p.average, prevGames: p.games, proj }), ratingPos(line, p.positions, pars), pars) };
}

export function buildMensRound(league: League): MRound {
  const pool = new Map<number, PlayerRow>([...league.players, ...league.freeAgents].map((p) => [p.id, p]));
  const pars = positionPars([...pool.values()]);
  const clubs = new Set(R1_2027.flatMap((g) => [g.home, g.away]));
  const teams: MTeam[] = [];
  for (const [id, t] of league.byTeam) {
    // The 2027 list: keepers plus the simulated redraft.
    const ids = [...t.projection.keepers, ...t.projection.drafted.map((d) => d.playerId)];
    const list = ids.map((x) => pool.get(x)).filter((p): p is PlayerRow => !!p && !p.list_status && !!p.afl_club && clubs.has(p.afl_club));
    const proj = new Map(list.map((p) => [p.id, projected2027(p) || 55]));
    const b = best22(list.map((p) => ({ ...p, average: proj.get(p.id)! })));
    const starters = (['DEF', 'MID', 'RUC', 'FWD'] as const).flatMap((l) => b.lines[l].map((p) => ({ p, l })));
    const ranked = [...starters].sort((x, y) => proj.get(y.p.id)! - proj.get(x.p.id)!);
    const capOf = (pid: number) => (ranked[0]?.p.id === pid ? 'C' : ranked[1]?.p.id === pid ? 'VC' : null);
    const players = [
      ...starters.map(({ p, l }) => simPlayer(p, l, capOf(p.id), proj.get(p.id)!, pars)),
      ...b.bench.map((p) => simPlayer(p, 'BENCH', null, proj.get(p.id)!, pars)),
    ];
    teams.push({ id, name: t.team.name, short: t.team.short_code, coach: t.team.coach_name, logo: t.team.logo_url ?? null, colour: t.team.colour ?? null, players });
  }
  // Randomised G-Train fixture for the week (seeded so it doesn't change on refresh).
  const r = rng(20270317);
  const order = teams.map((t) => t.id);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const matchups: [number, number][] = [];
  for (let i = 0; i + 1 < order.length; i += 2) matchups.push([order[i], order[i + 1]]);
  const start = R1_2027[0].start;
  const lastStart = Math.max(...R1_2027.map((g) => Date.parse(g.start)));
  // Last week's top performer: for this test round, the top scorer of the last 2026 round.
  const top = topFromLogs([...pool.values()], 2026);
  return { round: 1, season: 2027, now: '2027-03-20T21:05:00+11:00', start, end: new Date(lastStart + GAME_MINUTES * 60e3).toISOString(), games: R1_2027, teams, matchups, top, pars };
}
