-- DFS Australia player data + saved starting lineups.

alter table public.players
  add column if not exists dfs_id       text unique,
  add column if not exists height_cm    int,
  add column if not exists debut_year   int,
  add column if not exists career_games int,
  add column if not exists hist         jsonb;   -- [[season, games, AF average], ...]

-- Per-season box score averages from DFS (kicks, handballs, contested possessions, clearances ...).
alter table public.player_seasons
  add column if not exists box jsonb;

-- Where a coach has slotted each player. null = extended squad.
-- If a team has no lineup saved, the site falls back to the auto-picked Best 22.
alter table public.squad
  add column if not exists lineup text check (lineup in ('DEF', 'MID', 'RUC', 'FWD', 'BENCH'));
