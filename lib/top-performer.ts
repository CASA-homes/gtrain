// Matchday "top performer": the highest fantasy score from the last completed round. He gets the score plate
// (his score on a shiny plate in his club's colours) in every live matchup the following week.
import type { CSSProperties } from 'react';
import { CLUBS } from '@/lib/clubs';

export interface TopPerformer { id: number; name: string; club: string; score: number; round: number; season: number }

/** From each player's game log ([round, points, ...]): the last round anyone played, and its top scorer. */
export function topFromLogs(players: { id: number; name: string; full_name?: string | null; afl_club?: string | null; games_log?: (number | null)[][] | null }[], season: number): TopPerformer | null {
  let round = 0;
  for (const p of players) for (const g of p.games_log ?? []) if (g[1] != null && (g[0] ?? 0) > round) round = g[0]!;
  if (!round) return null;
  let best: TopPerformer | null = null;
  for (const p of players) {
    const g = (p.games_log ?? []).find((x) => x[0] === round && x[1] != null);
    if (g && (!best || g[1]! > best.score)) best = { id: p.id, name: p.full_name ?? p.name, club: p.afl_club ?? '', score: g[1]!, round, season };
  }
  return best;
}

/** CSS variables for the plate: --tp1 (main club colour) and --tp2 (the accent; skips white when there's a third colour). */
export function plateVars(club: string | null | undefined): CSSProperties {
  const c = club ? CLUBS[club] : undefined;
  const a = c?.a ?? '#b8862a';
  const b = c ? (c.b.toLowerCase() === '#ffffff' && c.m ? c.m : c.b) : '#ffe9a8';
  return { ['--tp1' as string]: a, ['--tp2' as string]: b };
}
