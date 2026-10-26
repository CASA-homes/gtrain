-- Games each player played for each G-Train club in past seasons (2022-2025), entered by the club or the commish.
-- 2026 onward is calculated from Keeper lineups (lib/club-games-2026.json).
create table if not exists public.club_games (
  team_id     int  not null references public.teams(id) on delete cascade,
  season      int  not null check (season between 2022 and 2025),
  player_name text not null check (length(player_name) between 2 and 60),
  games       int  not null check (games between 0 and 30),
  updated_at  timestamptz not null default now(),
  primary key (team_id, season, player_name)
);
alter table public.club_games enable row level security;
create policy "members read club games" on public.club_games for select to authenticated using (public.is_member());
create policy "own club writes club games" on public.club_games for insert to authenticated
  with check (team_id = public.my_team_id() or public.is_commish());
create policy "own club edits club games" on public.club_games for update to authenticated
  using (team_id = public.my_team_id() or public.is_commish()) with check (team_id = public.my_team_id() or public.is_commish());
create policy "own club deletes club games" on public.club_games for delete to authenticated
  using (team_id = public.my_team_id() or public.is_commish());
