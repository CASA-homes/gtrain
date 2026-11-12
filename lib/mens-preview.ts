// Matchup preview for Live Matchups: each club's form coming into the round. Pre-season (2027 round 1) this is their
// 2026 season: final ladder spot, record, average score, last five results, and ins/outs against their last 2026 team.
// Server-only (reads the 2026 rounds file).
import rounds from './rounds-2026.json';
import type { League } from '@/lib/data';

type Lineup = [string, string, string, string | null][];
const R = (rounds as unknown as { rounds: Record<string, Record<string, Lineup>> }).rounds;
const FX = (rounds as unknown as { fixtures: Record<string, [string, string, string, number | null, number | null][]> }).fixtures;
const norm = (s: string) => s.replace(/[’‘]/g, "'").trim().toLowerCase();

export interface TeamPreview {
  season: number;
  rank: number | null; w: number; l: number; d: number; avg: number | null;
  last5: ('W' | 'L' | 'D')[];
  /** player ids in the current 18 who weren't in the last team, and vice versa (names for outs) */
  ins: number[]; outs: string[];
  /** head to head that season, keyed by opponent team id */
  vs: Record<number, { w: number; l: number; d: number }>;
}

export function buildPreviews(league: League, current: { id: number; starters: number[] }[], season = 2026): Record<number, TeamPreview> {
  const byName = new Map(league.teams.map((t) => [norm(t.name), t.id]));
  const fxFor = (teamName: string) => Object.entries(FX).find(([n]) => norm(n) === norm(teamName))?.[1] ?? [];
  const byDfs = new Map<string, number>();
  for (const p of [...league.players, ...league.freeAgents]) if (p.dfs_id) byDfs.set(p.dfs_id, p.id);
  const lastRound = Math.max(...Object.keys(R).map(Number));
  const out: Record<number, TeamPreview> = {};
  for (const c of current) {
    const t = league.teams.find((x) => x.id === c.id); if (!t) continue;
    const lad = league.ladder.find((x) => x.season === season && x.team_id === c.id);
    const fx = fxFor(t.name).filter((f) => f[3] != null && f[4] != null);
    const res = fx.map((f) => (f[3]! > f[4]! ? 'W' : f[3]! < f[4]! ? 'L' : 'D') as 'W' | 'L' | 'D');
    const home = fx.filter((f) => /^\d+$/.test(f[0]));                 // home-and-away only, for record and average
    const w = lad?.wins ?? home.filter((f) => f[3]! > f[4]!).length;
    const l = lad?.losses ?? home.filter((f) => f[3]! < f[4]!).length;
    const d = lad?.draws ?? home.filter((f) => f[3] === f[4]).length;
    const avg = home.length ? Math.round((home.reduce((s, f) => s + f[3]!, 0) / home.length) * 10) / 10 : null;
    const vs: TeamPreview['vs'] = {};
    for (const f of fx) {
      const oid = byName.get(norm(f[1])); if (oid == null) continue;
      const v = (vs[oid] ??= { w: 0, l: 0, d: 0 });
      if (f[3]! > f[4]!) v.w++; else if (f[3]! < f[4]!) v.l++; else v.d++;
    }
    // Last team they named: the latest round they have a lineup for.
    let prev: Lineup = [];
    for (let r = lastRound; r >= 1 && !prev.length; r--) prev = Object.entries(R[String(r)] ?? {}).find(([n]) => norm(n) === norm(t.name))?.[1] ?? [];
    const prevStarters = prev.slice(0, 18);
    const prevIds = new Set(prevStarters.map((x) => (x[3] ? byDfs.get(x[3]) : undefined)).filter((x): x is number => x != null));
    const cur = new Set(c.starters);
    out[c.id] = {
      season, rank: lad?.rank ?? null, w, l, d, avg, last5: res.slice(-5),
      ins: c.starters.filter((id) => !prevIds.has(id)),
      outs: prevStarters.filter((x) => { const id = x[3] ? byDfs.get(x[3]) : undefined; return id == null || !cur.has(id); }).map((x) => x[0]),
      vs,
    };
  }
  return out;
}
