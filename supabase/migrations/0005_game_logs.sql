-- Every 2026 game from DFS Australia, per player: [round, AFL Fantasy points, time on ground %, kick-ins].
-- Floor, ceiling, consistency, durability and form are built from the full season, not the last five.
alter table public.player_seasons add column if not exists games_log jsonb;
