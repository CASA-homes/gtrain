-- Live Matchups: mini games. Any coach can start one for a round; the first type is an 11-a-side snake draft
-- (3 DEF, 4 MID, 1 RUC, 3 FWD) between 2-10 clubs. Several games can run in the same round.
-- The database enforces the turn order, slot limits and one-player-one-club, so picks from different phones can't collide.
create table if not exists mini_games (
  id bigint generated always as identity primary key,
  comp text not null default 'aflw2026' check (length(comp) between 3 and 20),
  round int not null check (round between 0 and 40),
  kind text not null default 'snake11' check (kind in ('snake11')),
  name text not null check (length(name) between 1 and 60),
  status text not null default 'drafting' check (status in ('drafting', 'done')),
  draft_order int[] not null check (array_length(draft_order, 1) between 2 and 10),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists mini_games_round on mini_games (comp, round);
create table if not exists mini_picks (
  game_id bigint not null references mini_games(id) on delete cascade,
  pick_no int not null check (pick_no between 0 and 109),
  team_id int not null references teams(id) on delete cascade,
  player_id int not null,
  player_name text not null check (length(player_name) between 1 and 80),
  slot text not null check (slot in ('DEF', 'MID', 'RUC', 'FWD')),
  picked_by uuid default auth.uid(),
  picked_at timestamptz not null default now(),
  primary key (game_id, pick_no),
  unique (game_id, player_id)
);
alter table mini_games enable row level security;
alter table mini_picks enable row level security;
create policy "mini_games: members read" on mini_games for select using (public.is_member());
create policy "mini_games: members create" on mini_games for insert with check (public.is_member() and created_by = auth.uid());
create policy "mini_games: owner or commish changes" on mini_games for update using (created_by = auth.uid() or public.is_commish());
create policy "mini_games: owner or commish removes" on mini_games for delete using (created_by = auth.uid() or public.is_commish());
create policy "mini_picks: members read" on mini_picks for select using (public.is_member());
create policy "mini_picks: own club, owner or commish picks" on mini_picks for insert with check (
  public.is_commish() or team_id = public.my_team_id() or exists (select 1 from mini_games g where g.id = game_id and g.created_by = auth.uid()));
create policy "mini_picks: owner or commish removes" on mini_picks for delete using (
  public.is_commish() or exists (select 1 from mini_games g where g.id = game_id and g.created_by = auth.uid()));

create or replace function public.mini_pick_check() returns trigger language plpgsql security definer set search_path = public as $$
declare g mini_games; n int; cnt int; r int; i int; expected int; used int; lim int;
begin
  select * into g from mini_games where id = new.game_id for update;
  if g is null or g.status <> 'drafting' then raise exception 'The draft is closed'; end if;
  select count(*) into cnt from mini_picks where game_id = new.game_id;
  n := array_length(g.draft_order, 1);
  if cnt >= n * 11 then raise exception 'The draft is full'; end if;
  if new.pick_no <> cnt then raise exception 'Someone else just picked. Try again.'; end if;
  r := cnt / n; i := cnt % n;
  expected := case when r % 2 = 0 then g.draft_order[i + 1] else g.draft_order[n - i] end;
  if new.team_id <> expected then raise exception 'It is not this club''s turn'; end if;
  lim := case new.slot when 'DEF' then 3 when 'MID' then 4 when 'RUC' then 1 else 3 end;
  select count(*) into used from mini_picks where game_id = new.game_id and team_id = new.team_id and slot = new.slot;
  if used >= lim then raise exception 'No % spot left', new.slot; end if;
  return new;
end $$;
drop trigger if exists mini_pick_check on mini_picks;
create trigger mini_pick_check before insert on mini_picks for each row execute function public.mini_pick_check();

create or replace function public.mini_pick_after() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; cnt int;
begin
  if tg_op = 'INSERT' then
    select array_length(draft_order, 1) into n from mini_games where id = new.game_id;
    select count(*) into cnt from mini_picks where game_id = new.game_id;
    if cnt >= n * 11 then update mini_games set status = 'done', finished_at = now() where id = new.game_id; end if;
  else
    update mini_games set status = 'drafting', finished_at = null where id = old.game_id and status = 'done';
  end if;
  return null;
end $$;
drop trigger if exists mini_pick_after on mini_picks;
create trigger mini_pick_after after insert or delete on mini_picks for each row execute function public.mini_pick_after();
