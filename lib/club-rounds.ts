// "For your club" rows on the player pop-up: the rounds a player was on the field for a G-Train club, with that week's result.
// Server-only (the data file is ~130 KB); attach the rows to profiles before they go to the client.
import data from './club-rounds-2026.json';
import type { MProfile, MRound } from '@/lib/mens-round';

export interface ClubRow { season: number; rd: string; opp: string; res: string; f: number | null; a: number | null; sc: number | null; cup?: boolean }
const PLAYED = data.played as unknown as Record<string, [string, number][]>;
const FIX = data.fixtures as unknown as Record<string, [string, string, string, number | null, number | null][]>;

/** 2026: keeper rounds 1-21 line up with AFL rounds 1-21; the three finals weeks are AFL rounds 22-24. */
export function clubRows(fullName: string | null | undefined, teamName: string | null | undefined, log: MProfile['log']): ClubRow[] {
  if (!fullName || !teamName) return [];
  const score = new Map(log.map((g) => [g[0], g[1]]));
  const fx = FIX[teamName] ?? [];
  const out: ClubRow[] = [];
  for (const [team, r] of PLAYED[fullName] ?? []) {
    if (team !== teamName) continue;
    const rd = r <= 21 ? String(r) : `F${r - 21}`;
    const f = fx.find((x) => x[0] === rd);
    if (!f || f[1] === 'Bye') continue;
    out.push({ season: 2026, rd, opp: f[1], res: f[2], f: f[3], a: f[4], sc: score.get(r) ?? null });
  }
  return out;
}

/** Fill in the club rows for every player in a simulated men's round. */
export function withClubRows(round: MRound): MRound {
  for (const t of round.teams) for (const p of t.players) p.prof = { ...p.prof, club: clubRows(p.name, t.name, p.prof.log) };
  return round;
}
