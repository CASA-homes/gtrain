-- G-Train Knockout Cup: each club's cup lineup per cup round, and cup results (entered by the commish until scoring is automated).
create table if not exists cup_lineups (
  season int not null,
  cup_round int not null check (cup_round between 0 and 30),
  team_id int not null references teams(id) on delete cascade,
  lineup jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (season, cup_round, team_id)
);
alter table cup_lineups enable row level security;
create policy "cup_lineups: members read" on cup_lineups for select using (public.is_member());
create policy "cup_lineups: own club or commish writes" on cup_lineups for insert with check (team_id = public.my_team_id() or public.is_commish());
create policy "cup_lineups: own club or commish updates" on cup_lineups for update using (team_id = public.my_team_id() or public.is_commish())
  with check (team_id = public.my_team_id() or public.is_commish());

create table if not exists cup_results (
  season int not null,
  match_id text not null check (length(match_id) between 1 and 12),
  home_score int not null,
  away_score int not null,
  updated_at timestamptz not null default now(),
  primary key (season, match_id)
);
alter table cup_results enable row level security;
create policy "cup_results: members read" on cup_results for select using (public.is_member());
create policy "cup_results: commish writes" on cup_results for insert with check (public.is_commish());
create policy "cup_results: commish updates" on cup_results for update using (public.is_commish()) with check (public.is_commish());
