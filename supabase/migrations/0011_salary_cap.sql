-- Salary Cap 5: each club picks any 5 players under a budget (prices from season averages), one captain scores double.
-- Players lock when their game starts. Whole round, or a single match (match_id = AFL Fantasy game id).
alter table mini_games drop constraint if exists mini_games_kind_check;
alter table mini_games add constraint mini_games_kind_check check (kind in ('snake11', 'cap5'));
alter table mini_games add column if not exists budget int check (budget between 100 and 1000);   -- $k
alter table mini_games add column if not exists match_id bigint;

create table if not exists mini_entries (
  game_id bigint not null references mini_games(id) on delete cascade,
  team_id int not null references teams(id) on delete cascade,
  players int[] not null default '{}' check (coalesce(array_length(players, 1), 0) <= 5),
  captain int,
  cost int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, team_id)
);
alter table mini_entries enable row level security;
create policy "mini_entries: members read" on mini_entries for select using (public.is_member());
create policy "mini_entries: own club enters" on mini_entries for insert with check (
  (team_id = public.my_team_id() or public.is_commish())
  and exists (select 1 from mini_games g where g.id = game_id and g.kind = 'cap5' and team_id = any (g.draft_order)));
create policy "mini_entries: own club changes" on mini_entries for update using (team_id = public.my_team_id() or public.is_commish())
  with check (team_id = public.my_team_id() or public.is_commish());
create policy "mini_entries: own club removes" on mini_entries for delete using (team_id = public.my_team_id() or public.is_commish());
