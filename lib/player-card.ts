// Server-side inputs for the player card: per-game detail and percentile bars against the same line.
import games from '@/lib/player-games.json';
import type { CardGame, CardProps } from '@/components/PlayerCard';
import type { Box, Line, PlayerRow, Ratings } from '@/lib/ratings';

const CURRENT = 2026;

const G = (games as unknown as { players: Record<string, { g: CardGame[]; p: [string | null, string | null, number][] }> }).players;

type Stat = [string, (b: Box) => number | null | undefined, (v: number) => string];
const f1 = (v: number) => v.toFixed(1), f0 = (v: number) => v.toFixed(0), pc = (v: number) => `${v.toFixed(0)}%`;
const disp = (b: Box) => (b.k ?? 0) + (b.h ?? 0);
const STATS: Record<Line, Stat[]> = {
  MID: [['Disposals', disp, f1], ['Contested poss.', (b) => b.cp, f1], ['Clearances', (b) => b.cl, f1], ['Tackles', (b) => b.t, f1], ['Inside 50s', (b) => b.i5, f1], ['Metres gained', (b) => b.mg, f0], ['Points per minute', (b) => b.ppm, (v) => v.toFixed(2)], ['Time on ground', (b) => b.tog, pc]],
  DEF: [['Disposals', disp, f1], ['Marks', (b) => b.m, f1], ['Rebound 50s', (b) => b.r5, f1], ['Intercepts', (b) => b.it, f1], ['Kick-ins', (b) => b.ki, f1], ['Metres gained', (b) => b.mg, f0], ['Points per minute', (b) => b.ppm, (v) => v.toFixed(2)], ['Time on ground', (b) => b.tog, pc]],
  FWD: [['Goals', (b) => b.g, f1], ['Marks inside 50', (b) => b.mi5, f1], ['Inside 50s', (b) => b.i5, f1], ['Tackles', (b) => b.t, f1], ['Disposals', disp, f1], ['Contested marks', (b) => b.cm, f1], ['Points per minute', (b) => b.ppm, (v) => v.toFixed(2)], ['Time on ground', (b) => b.tog, pc]],
  RUC: [['Hitouts', (b) => b.ho, f1], ['Ruck contests', (b) => b.rc, pc], ['Clearances', (b) => b.cl, f1], ['Contested poss.', (b) => b.cp, f1], ['Disposals', disp, f1], ['Marks', (b) => b.m, f1], ['Points per minute', (b) => b.ppm, (v) => v.toFixed(2)], ['Time on ground', (b) => b.tog, pc]],
};
const LINE_NAME: Record<Line, string> = { DEF: 'defender', MID: 'midfielder', RUC: 'ruck', FWD: 'forward' };

export function playerCard(p: PlayerRow, r: Ratings, rostered: PlayerRow[], ratings: Map<number, Ratings>): CardProps | null {
  const d = p.dfs_id ? G[p.dfs_id] : null;
  if (!d || !d.g.length) return null;
  const line = r.line;
  const pool = rostered.filter((q) => q.box && (q.box.gm ?? 0) >= 8 && ratings.get(q.id)?.line === line);
  const pct = p.box ? STATS[line].map(([label, f, fmt]) => {
    const v = f(p.box!);
    if (v == null) return null;
    const vals = pool.map((q) => f(q.box!) ?? 0);
    const below = vals.filter((x) => x < v).length, same = vals.filter((x) => x === v).length;
    return { label, value: fmt(v), pct: vals.length ? Math.round(((below + same / 2) / vals.length) * 100) : 50 };
  }).filter((x): x is { label: string; value: string; pct: number } => x != null) : [];
  return {
    playerNo: p.dfs_id ? p.dfs_id.replace('CD_I', '') : null, games: d.g, prev: d.p, pct, lineName: LINE_NAME[line],
    seasons: [...(p.hist ?? [])].filter((h) => h[1] > 0).sort((a, b) => b[0] - a[0]), current: CURRENT,
    poolNote: `percentile · ${pool.length} rostered ${LINE_NAME[line]}s, 8+ games`,
  };
}
