// AFL Fantasy's public data files (no login, no browser): the source for live scores today, for AFLW and the men's game.
//   rounds.json                   fixture, game status, quarter and score (updated live)
//   players.json                  every player: position, average, scores by completed round
//   players_live_scores/{r}.json  [{id, score, locked}] for round r, updated during games
//   squads.json                   club names
// The men's game (slug 'fantasy') and AFLW ('aflw_fantasy') use the same file shapes.
// Unofficial: the AFL can change these files without notice. See lib/scores/index.ts for swapping providers.
import type { LProfile, LRound, ScoreProvider } from './types';

type RawGame = { id: number; date: string; status: string; homeId: number; homeScore: number | null; awayId: number; awayScore: number | null; period: number | null; periodSeconds: number };
type RawRound = { id: number; roundNumber: number; name: string; status: string; startDate: string; endDate: string; games: RawGame[] };
type RawPlayer = { id: number; squadId: number; firstName: string; lastName: string; price: number; status: string; position: string[]; gamesPlayed: number; averagePoints: number | null; scores: Record<string, number> | null; highScore: number | null; last3Avg: number | null };
type RawSquad = { id: number; name: string; abbreviation: string };

async function get<T>(base: string, path: string, revalidate: number): Promise<T> {
  const r = await fetch(base + path, { next: { revalidate } });
  if (!r.ok) throw new Error(`AFL Fantasy feed ${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

/** Just the round list and each round's status (one small file), for code that only needs to know which rounds are finished. */
async function rounds(base: string): Promise<{ n: number; status: string }[]> {
  const list = await get<RawRound[]>(base, 'rounds.json', 300);
  return list.map((x) => ({ n: x.roundNumber, status: x.status }));
}

/** The round to show by default: the one being played, else the next scheduled, else the last. */
function currentRound(rounds: RawRound[]) {
  return rounds.find((r) => r.status !== 'completed' && r.status !== 'scheduled')
    ?? rounds.find((r) => r.status === 'scheduled')
    ?? rounds[rounds.length - 1];
}

async function liveRound(base: string, round?: number): Promise<LRound> {
  const [rounds, squads, players] = await Promise.all([
    get<RawRound[]>(base, 'rounds.json', 20), get<RawSquad[]>(base, 'squads.json', 86400), get<RawPlayer[]>(base, 'players.json', 120),
  ]);
  const r = (round && rounds.find((x) => x.roundNumber === round)) || currentRound(rounds);
  const done = r.status === 'completed';
  let live: { id: number; score: number | null }[] = [];
  if (!done) { try { live = await get<{ id: number; score: number | null }[]>(base, `players_live_scores/${r.roundNumber}.json`, 15); } catch { live = []; } }
  const liveBy = new Map(live.map((x) => [x.id, x.score]));
  const sq = new Map(squads.map((s) => [s.id, s]));
  const playing = new Set(r.games.flatMap((g) => [g.homeId, g.awayId]));
  const prev = [...rounds].filter((x) => x.status === 'completed' && x.roundNumber < r.roundNumber).pop();
  let top: LRound['top'] = null;
  if (prev) for (const p of players) {
    const s = p.scores?.[String(prev.roundNumber)];
    if (s != null && (!top || s > top.score)) top = { id: p.id, name: `${p.firstName} ${p.lastName}`, squad: sq.get(p.squadId)?.abbreviation ?? '', score: s, round: prev.roundNumber };
  }
  return {
    round: r.roundNumber, name: r.name, status: r.status,
    rounds: rounds.map((x) => ({ n: x.roundNumber, name: x.name, status: x.status })),
    games: r.games.map((g) => ({
      id: g.id, date: g.date, status: g.status, homeId: g.homeId, awayId: g.awayId,
      home: sq.get(g.homeId)?.abbreviation ?? String(g.homeId), away: sq.get(g.awayId)?.abbreviation ?? String(g.awayId),
      homeScore: g.homeScore, awayScore: g.awayScore, period: g.period, periodSeconds: g.periodSeconds,
    })),
    players: players.filter((p) => playing.has(p.squadId)).map((p) => ({
      id: p.id, name: `${p.firstName} ${p.lastName}`, squadId: p.squadId, squad: sq.get(p.squadId)?.abbreviation ?? '', pos: p.position,
      avg: p.averagePoints, l3: p.last3Avg ?? null, hi: p.highScore ?? null, games: p.gamesPlayed, status: p.status,
      score: done ? (p.scores?.[String(r.roundNumber)] ?? null) : (liveBy.get(p.id) ?? null),
    })),
    fetchedAt: new Date().toISOString(),
    top,
  };
}

/* ---------------- player profile (pop-up in the live game) ---------------- */

async function profile(base: string, id: number): Promise<LProfile | null> {
  type FullPlayer = RawPlayer & { dob?: string; totalPoints?: number; last5Avg?: number | null; lowScore?: number | null; seasonRank?: number | null;
    ownership?: Record<string, number> | null; seasonPriceChange?: number; seasons?: number[]; injuryMeta?: unknown };
  const [rounds, squads, players] = await Promise.all([
    get<RawRound[]>(base, 'rounds.json', 60), get<RawSquad[]>(base, 'squads.json', 86400), get<FullPlayer[]>(base, 'players.json', 120),
  ]);
  const p = players.find((x) => x.id === id);
  if (!p) return null;
  const sq = new Map(squads.map((s) => [s.id, s]));
  const abbr = (sid: number) => sq.get(sid)?.abbreviation ?? String(sid);
  const gameOf = (r: RawRound) => r.games.find((g) => g.homeId === p.squadId || g.awayId === p.squadId);
  const log = Object.entries(p.scores ?? {}).map(([rn, score]) => {
    const g = gameOf(rounds.find((r) => r.roundNumber === Number(rn)) ?? ({ games: [] } as unknown as RawRound));
    const home = g?.homeId === p.squadId;
    return { round: Number(rn), score, opp: g ? abbr(home ? g.awayId : g.homeId) : '', home };
  }).sort((a, b) => a.round - b.round);
  const nr = currentRound(rounds), ng = nr && gameOf(nr);
  const dob = p.dob ? new Date(p.dob) : null;
  const age = dob ? Math.floor((Date.now() - dob.getTime()) / 31_557_600_000) : null;
  const years = [...new Set((p.seasons ?? []).map((s) => Math.floor(s / 10)))].sort();
  const own = p.ownership ? Object.entries(p.ownership).sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1] ?? null : null;
  // Position rank: by average among players at that position with 3+ games.
  const mainPos = p.position[0];
  const peers = players.filter((x) => x.position.includes(mainPos) && x.gamesPlayed >= 3 && x.averagePoints != null).sort((a, b) => (b.averagePoints ?? 0) - (a.averagePoints ?? 0));
  const pr = peers.findIndex((x) => x.id === p.id);
  const inj = p.injuryMeta as { description?: string; weeks?: number } | null | undefined;
  return {
    id: p.id, name: `${p.firstName} ${p.lastName}`, squad: abbr(p.squadId), club: sq.get(p.squadId)?.name ?? '', pos: p.position, age,
    firstSeason: years[0] ?? null, seasons: years.length,
    status: p.status, injury: inj ? [inj.description || 'Injured', inj.weeks ? `${inj.weeks} week${inj.weeks > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : null,
    price: p.price, seasonPriceChange: p.seasonPriceChange ?? 0, owned: own,
    games: p.gamesPlayed, avg: p.averagePoints, l3: p.last3Avg ?? null, l5: p.last5Avg ?? null, hi: p.highScore ?? null, lo: p.lowScore ?? null, total: p.totalPoints ?? 0,
    rank: p.seasonRank ?? null, posRank: pr >= 0 ? { pos: mainPos, rank: pr + 1, of: peers.length } : null,
    log,
    next: nr && ng && !log.some((l) => l.round === nr.roundNumber)
      ? { round: nr.roundNumber, opp: abbr(ng.homeId === p.squadId ? ng.awayId : ng.homeId), home: ng.homeId === p.squadId, date: ng.date, status: ng.status }
      : null,
  };
}

/** A ScoreProvider for one AFL Fantasy game, e.g. aflFantasy('fantasy') for the men's or aflFantasy('aflw_fantasy'). */
export function aflFantasy(slug: string): ScoreProvider {
  // SCORE_FEED_BASE overrides the data URL for local testing (AFLW_FEED_BASE still works for the AFLW feed).
  const base = process.env.SCORE_FEED_BASE || (slug === 'aflw_fantasy' && process.env.AFLW_FEED_BASE) || `https://fantasy.afl.com.au/json/${slug}/`;
  return {
    rounds: () => rounds(base),
    liveRound: (round?: number) => liveRound(base, round),
    profile: (id: number) => profile(base, id),
    photo: (id: number) => `https://fantasy.afl.com.au/media/${slug}/players/${id}_100.webp`,
  };
}
