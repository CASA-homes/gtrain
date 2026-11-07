// Past G-Train rounds for Live Matchups: the 2026 season week by week, with each club's actual 18 + emergencies,
// every player's AFL game that round (score, TOG, CBA, quarters, zones, heat map) and the final results.
// Server-only: the data files are large; only the chosen round goes to the client.
import rounds from './rounds-2026.json';
import games from './player-games.json';
import type { League } from '@/lib/data';
import type { PlayerRow } from '@/lib/ratings';
import { profileOf, type MProfile } from '@/lib/mens-round';
import { clubRows } from '@/lib/club-rounds';
import { photoUrl } from '@/lib/photos';

type Lineup = [string, string, string, string | null][];
const R = (rounds as unknown as { rounds: Record<string, Record<string, Lineup>> }).rounds;
const FX = (rounds as unknown as { fixtures: Record<string, [string, string, string, number | null, number | null][]> }).fixtures;
/** [round, opp, venue, fp, tog, cba, q1, q2, q3, q4, d50, dmid, amid, a50, heat] */
export type HGame = [number, string | null, string | null, number, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, string | null];
const G = (games as unknown as { players: Record<string, { g: HGame[] }> }).players;

export const HISTORY_SEASON = 2026;
export const HISTORY_ROUNDS = Array.from({ length: 24 }, (_, i) => i + 1);
export const roundName = (r: number) => (r <= 21 ? `Round ${r}` : ['Elimination final', 'Preliminary final', 'Grand final'][r - 22]);
const fxLabel = (r: number) => (r <= 21 ? String(r) : `F${r - 21}`);

export interface HPlayer {
  key: string; name: string; club: string; line: string; emg: boolean;
  game: HGame | null; avg: number | null; playerNo: string | null; photo: string | null;
  id: number | null; prof?: MProfile;
}
export interface HSide { teamId: number | null; name: string; short: string; colour: string | null; coach: string; total: number | null; res: string; players: HPlayer[] }
export interface HRound { season: number; round: number; label: string; matchups: { a: string; b: string; as: number | null; bs: number | null }[]; mine: [HSide, HSide] | null; myName: string }

export function buildHistoryRound(round: number, league: League, myTeamId: number): HRound {
  const team = (name: string) => league.teams.find((t) => t.name === name);
  const myName = league.teams.find((t) => t.id === myTeamId)?.name ?? '';
  const byDfs = new Map<string, PlayerRow>();
  for (const p of [...league.players, ...league.freeAgents]) if (p.dfs_id) byDfs.set(p.dfs_id, p);
  const label = fxLabel(round);
  // Every game that week, once each.
  const seen = new Set<string>(), matchups: HRound['matchups'] = [];
  for (const [t, rows] of Object.entries(FX)) {
    const f = rows.find((x) => x[0] === label);
    if (!f || f[1] === 'Bye' || seen.has(t)) continue;
    seen.add(t); seen.add(f[1]);
    matchups.push({ a: t, b: f[1], as: f[3], bs: f[4] });
  }
  const side = (name: string): HSide => {
    const t = team(name);
    const f = FX[name]?.find((x) => x[0] === label);
    const players = (R[String(round)]?.[name] ?? []).map(([nm, line, club, dfs], i): HPlayer => {
      const log = dfs ? G[dfs]?.g ?? [] : [];
      const game = log.find((g) => g[0] === round) ?? null;
      const all = log.filter((g) => g[3] != null);
      const p = dfs ? byDfs.get(dfs) : undefined;
      let prof: MProfile | undefined;
      if (p) { const pr = profileOf(p); prof = { ...pr, club: clubRows(p.full_name ?? p.name, t?.name ?? name, pr.log) }; }
      return {
        key: `${i}-${nm}`, name: p?.full_name ?? nm, club, line: line.replace(/^E/, '') || 'MID', emg: i >= 18,
        game, avg: all.length ? Math.round(all.reduce((a, g) => a + g[3], 0) / all.length) : p?.average != null ? Math.round(p.average) : null,
        playerNo: dfs ? dfs.replace('CD_I', '') : null, photo: p ? photoUrl(p) : null, id: p?.id ?? null, prof,
      };
    });
    return { teamId: t?.id ?? null, name, short: t?.short_code ?? name.slice(0, 2).toUpperCase(), colour: t?.colour ?? null, coach: t?.coach_name ?? '', total: f?.[3] ?? null, res: f?.[2] ?? '', players };
  };
  const mf = FX[myName]?.find((x) => x[0] === label);
  const mine: HRound['mine'] = mf && mf[1] !== 'Bye' ? [side(myName), side(mf[1])] : null;
  return { season: HISTORY_SEASON, round, label: roundName(round), matchups, mine, myName };
}
