// League history and rivalries: career records since 2022 plus every 2026 result from Keeper.
// Keeper only shows the current season's fixture, so head-to-head starts in 2026 and builds from here.
import LEAGUE from '@/data/league.json';
import RESULTS from '@/lib/results-2026.json';

const norm = (s: string) => s.toLowerCase().replace(/[’'`]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

export interface Game { round: string; team: string; opp: string; win: boolean; for: number; against: number; final: boolean }
export interface H2H { w: number; l: number; for: number; against: number }
export interface Career { name: string; coach: string; w: number; l: number; pct: number; flags: number[]; runnerUp: number[]; spoons: number[]; w26: number; l26: number }

export function leagueHistory() {
  const games: Game[] = [];
  for (const [team, rows] of Object.entries((RESULTS as unknown as { teams: Record<string, [string, string, string, number, number][]> }).teams)) {
    for (const [round, opp, res, f, a] of rows) games.push({ round, team, opp, win: res === 'W', for: f, against: a, final: round.startsWith('F') });
  }
  const teams = Object.keys((RESULTS as { teams: Record<string, unknown> }).teams);

  // Head to head: h2h[team][opp]
  const h2h: Record<string, Record<string, H2H>> = {};
  for (const g of games) {
    const row = (h2h[g.team] ??= {});
    const c = (row[g.opp] ??= { w: 0, l: 0, for: 0, against: 0 });
    if (g.win) c.w++; else c.l++;
    c.for += g.for; c.against += g.against;
  }

  // Each game once (from the winner's side) for records
  const once = games.filter((g) => g.win);
  const by = <T,>(xs: T[], f: (x: T) => number) => [...xs].sort((a, b) => f(b) - f(a));
  const records = {
    biggestWin: by(once, (g) => g.for - g.against)[0],
    closest: by(once, (g) => -(g.for - g.against))[0],
    highest: by(games, (g) => g.for)[0],
    lowest: by(games, (g) => -g.for)[0],
    bestLoss: by(games.filter((g) => !g.win), (g) => g.for)[0],
    worstWin: by(once, (g) => -g.for)[0],
  };

  // Nemesis = opponent with the worst record against (then worst margin); bunny = the reverse.
  const rivals = teams.map((t) => {
    const opps = Object.entries(h2h[t] ?? {}).map(([o, c]) => ({ o, ...c, diff: c.w - c.l, margin: c.for - c.against }));
    const nemesis = [...opps].sort((a, b) => a.diff - b.diff || a.margin - b.margin)[0];
    const bunny = [...opps].sort((a, b) => b.diff - a.diff || b.margin - a.margin)[0];
    return { team: t, nemesis, bunny };
  });

  const w26 = (t: string) => games.filter((g) => g.team === t && g.win).length;
  const l26 = (t: string) => games.filter((g) => g.team === t && !g.win).length;
  const careers: Career[] = LEAGUE.teams.map((t) => {
    const [w, l] = t.record.split('-').map(Number);
    const key = teams.find((x) => norm(x) === norm(t.name)) ?? t.name;
    return { name: t.name, coach: t.coach, w, l, pct: w / Math.max(1, w + l), flags: t.premierships, runnerUp: t.runner_up, spoons: t.spoons, w26: w26(key), l26: l26(key) };
  }).sort((a, b) => b.pct - a.pct);

  // Teams in ladder order for the grid
  const order = LEAGUE.ladder_2026_final.map((l) => teams.find((x) => norm(x) === norm(l.team)) ?? l.team);

  return { games, h2h, records, rivals, careers, order, gf: LEAGUE.grand_final_2026 };
}

export const sameTeam = (a: string, b: string) => norm(a) === norm(b);
