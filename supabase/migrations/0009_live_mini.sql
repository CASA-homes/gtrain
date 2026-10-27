-- Live mini game (AFLW test, then AFL 2027): the commish picks an 11 for each joined G-Train club per round
-- (3 DEF, 4 MID, 1 RUC, 3 FWD) and pairs clubs into matchups. Live scores come straight from the AFL Fantasy feed,
-- so nothing about scores is stored here.
create table if not exists mini_lineups (
  comp text not null default 'aflw2026' check (length(comp) between 3 and 20),
  round int not null check (round between 0 and 40),
  team_id int not null references teams(id) on delete cascade,
  players jsonb not null default '{}'::jsonb,       -- {"DEF":[id,id,id],"MID":[...4],"RUC":[id],"FWD":[...3]} (AFL Fantasy player ids)
  updated_at timestamptz not null default now(),
  primary key (comp, round, team_id)
);
create table if not exists mini_matchups (
  comp text not null default 'aflw2026' check (length(comp) between 3 and 20),
  round int not null check (round between 0 and 40),
  home_team_id int not null references teams(id) on delete cascade,
  away_team_id int not null references teams(id) on delete cascade,
  primary key (comp, round, home_team_id),
  check (home_team_id <> away_team_id)
);
alter table mini_lineups enable row level security;
alter table mini_matchups enable row level security;
create policy "mini_lineups: members read" on mini_lineups for select using (public.is_member());
create policy "mini_lineups: commish writes" on mini_lineups for insert with check (public.is_commish());
create policy "mini_lineups: commish changes" on mini_lineups for update using (public.is_commish()) with check (public.is_commish());
create policy "mini_lineups: commish removes" on mini_lineups for delete using (public.is_commish());
create policy "mini_matchups: members read" on mini_matchups for select using (public.is_member());
create policy "mini_matchups: commish writes" on mini_matchups for insert with check (public.is_commish());
create policy "mini_matchups: commish changes" on mini_matchups for update using (public.is_commish()) with check (public.is_commish());
create policy "mini_matchups: commish removes" on mini_matchups for delete using (public.is_commish());
