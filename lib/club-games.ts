// Games played FOR each G-Train club. 2026 comes from Keeper's round-by-round lineups (scripts/keeper-2026-build.py);
// 2022-2025 are entered by each club into the club_games table. Names are matched loosely ("Bailey Smith" = "B. Smith").
import data2026 from '@/lib/club-games-2026.json';

export const MANUAL_SEASONS = [2022, 2023, 2024, 2025] as const;
export const SEASONS = [...MANUAL_SEASONS, 2026] as const;
type Row2026 = [string, string | null, number, number, number];
const D = data2026 as unknown as { teams: Record<string, Row2026[]> };

/** "Bailey Smith" / "B. Smith" / "b smith" -> "b smith" */
export function nameKey(n: string): string {
  const parts = n.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' -]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join(' ');
  return `${parts[0][0]} ${parts.slice(1).join(' ')}`;
}

export interface ClubGamesRow { key: string; name: string; dfs: string | null; bySeason: Partial<Record<number, number>>; total: number; starts2026: number }

export function clubGames(teamName: string, manual: { season: number; player_name: string; games: number }[]): ClubGamesRow[] {
  const rows = new Map<string, ClubGamesRow>();
  const get = (name: string) => {
    const key = nameKey(name);
    let r = rows.get(key);
    if (!r) { r = { key, name, dfs: null, bySeason: {}, total: 0, starts2026: 0 }; rows.set(key, r); }
    return r;
  };
  for (const [name, dfs, games, starts] of D.teams[teamName] ?? []) {
    if (!games) continue;
    const r = get(name); r.dfs = dfs; r.bySeason[2026] = games; r.starts2026 = starts;
  }
  for (const m of manual) {
    const r = get(m.player_name);
    if (r.name.length < m.player_name.length) r.name = m.player_name;   // prefer the fuller name
    r.bySeason[m.season] = m.games;
  }
  for (const r of rows.values()) r.total = Object.values(r.bySeason).reduce<number>((t, g) => t + (g ?? 0), 0);
  return [...rows.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
