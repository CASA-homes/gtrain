-- Squad setup for a league that already plays somewhere else: every coach ticks their own squad off the AFL list,
-- first in gets the player, and a coach who thinks someone else took his player flags it for the commish.
-- The commish signs each squad off, can move or add anyone, fix pick ownership (traded picks), then locks squads.
-- G-Train (league 1) is never touched: its lists are already set.

alter table public.leagues
  add column if not exists setup_mode text check (setup_mode in ('picks', 'draft', 'import')),
  add column if not exists squads_locked_at timestamptz;

create table if not exists public.squad_setup (
  team_id int primary key references public.teams(id) on delete cascade,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  status text not null default 'picking' check (status in ('picking', 'submitted', 'approved')),
  submitted_at timestamptz,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.squad_flags (
  id serial primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  player_id int not null references public.players(id) on delete cascade,
  claimant_team_id int not null references public.teams(id) on delete cascade,
  holder_team_id int references public.teams(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'moved', 'kept', 'gone')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists squad_flags_league_idx on public.squad_flags (league_id);
create unique index if not exists squad_flags_open_key on public.squad_flags (league_id, player_id, claimant_team_id) where status = 'open';

alter table public.squad_setup enable row level security;
alter table public.squad_flags enable row level security;
drop policy if exists "league scope" on public.squad_setup;
drop policy if exists "league scope" on public.squad_flags;
create policy "league scope" on public.squad_setup as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
create policy "league scope" on public.squad_flags as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
drop policy if exists "members read" on public.squad_setup;
drop policy if exists "members read" on public.squad_flags;
create policy "members read" on public.squad_setup for select to authenticated using ((select public.is_member()));
create policy "members read" on public.squad_flags for select to authenticated using ((select public.is_member()));
drop policy if exists "definer access" on public.squad_setup;
drop policy if exists "definer access" on public.squad_flags;
create policy "definer access" on public.squad_setup for all to khq_definer using (true) with check (true);
create policy "definer access" on public.squad_flags for all to khq_definer using (true) with check (true);
-- Every change goes through the functions below.

-- Not G-Train, not locked, and the caller is a club coach (or the commish when p_commish).
create or replace function public.sq_guard(p_commish boolean) returns int
language plpgsql stable security definer set search_path = public as $$
declare lid int := public.current_league(); locked timestamptz; tid int := public.my_team_id();
begin
  if lid = 1 then raise exception 'G-Train''s lists are already set'; end if;
  if p_commish and not public.is_commish() then raise exception 'Only the commish can do that'; end if;
  if not p_commish and (tid is null or exists (select 1 from teams where id = tid and is_guest)) then raise exception 'Join a club first'; end if;
  select squads_locked_at into locked from leagues where id = lid;
  if locked is not null then raise exception 'Squads are locked. The commish can unlock them to make changes.'; end if;
  return lid;
end $$;

-- Put a player on a club's list (list-size check), with an ownership row.
create or replace function public.sq_put(p_lid int, p_player int, p_team int, p_how text) returns void
language plpgsql security definer set search_path = public as $$
declare lim int; n int; yr int; tname text;
begin
  select coalesce((select list_size from kc_settings where league_id = p_lid), 33) into lim;
  select count(*) into n from squad where league_id = p_lid and team_id = p_team;
  select name into tname from teams where id = p_team;
  if n >= lim then raise exception '%''s list is full (% players)', tname, lim; end if;
  select coalesce(season, 2027) into yr from leagues where id = p_lid;
  insert into squad (player_id, team_id, is_keeper, is_rookie_keeper, acquired_how, acquired_season, league_id)
  values (p_player, p_team, false, false, p_how, yr, p_lid);
  insert into ownership (player_id, team_id, from_season, how, league_id) values (p_player, p_team, yr, p_how, p_lid);
end $$;

-- Take a player off whichever list he's on (setup only, so his setup ownership row goes too).
create or replace function public.sq_take(p_lid int, p_player int) returns void
language plpgsql security definer set search_path = public as $$
declare yr int;
begin
  select coalesce(season, 2027) into yr from leagues where id = p_lid;
  delete from squad where league_id = p_lid and player_id = p_player;
  delete from ownership where league_id = p_lid and player_id = p_player and from_season = yr and to_season is null;
end $$;

-- Coach: add (p_add) or remove a player on their own list. Taken players can't be added: flag them instead.
create or replace function public.squad_pick(p_player int, p_add boolean) returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.sq_guard(false); tid int := public.my_team_id(); owner int; st text; n int;
begin
  select status into st from squad_setup where team_id = tid;
  if st = 'approved' then raise exception 'Your squad is signed off. Ask the commish to change it.'; end if;
  if not exists (select 1 from players where id = p_player) then raise exception 'Unknown player'; end if;
  select team_id into owner from squad where league_id = lid and player_id = p_player;
  if p_add then
    if owner is distinct from tid then
      if owner is not null then
        raise exception '% is already with %. Flag him if he''s yours.', (select name from players where id = p_player), (select name from teams where id = owner);
      end if;
      perform public.sq_put(lid, p_player, tid, 'Picked');
    end if;
  elsif owner = tid then
    perform public.sq_take(lid, p_player);
    update squad_flags set status = 'gone', resolved_at = now() where league_id = lid and player_id = p_player and status = 'open';
  end if;
  insert into squad_setup (team_id, league_id, status) values (tid, lid, 'picking')
  on conflict (team_id) do update set status = 'picking', submitted_at = null, updated_at = now();
  select count(*) into n from squad where league_id = lid and team_id = tid;
  return json_build_object('count', n);
end $$;

-- Coach: hand the squad to the commish.
create or replace function public.squad_submit() returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.sq_guard(false); tid int := public.my_team_id(); n int;
begin
  select count(*) into n from squad where league_id = lid and team_id = tid;
  if n = 0 then raise exception 'Add your players first'; end if;
  if (select status from squad_setup where team_id = tid) = 'approved' then return json_build_object('status', 'approved'); end if;
  insert into squad_setup (team_id, league_id, status, submitted_at) values (tid, lid, 'submitted', now())
  on conflict (team_id) do update set status = 'submitted', submitted_at = now(), updated_at = now();
  return json_build_object('status', 'submitted', 'count', n);
end $$;

-- Coach: "he's mine". Goes to the commish.
create or replace function public.squad_flag(p_player int) returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.sq_guard(false); tid int := public.my_team_id(); holder int;
begin
  select team_id into holder from squad where league_id = lid and player_id = p_player;
  if holder is null then raise exception 'Nobody has him yet. Add him to your squad.'; end if;
  if holder = tid then raise exception 'He''s already on your list'; end if;
  insert into squad_flags (league_id, player_id, claimant_team_id, holder_team_id) values (lid, p_player, tid, holder)
  on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- Commish: put a player on any club (p_team), or off every list (p_team null).
create or replace function public.squad_admin_set(p_player int, p_team int) returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.sq_guard(true); owner int;
begin
  if not exists (select 1 from players where id = p_player) then raise exception 'Unknown player'; end if;
  if p_team is not null and not exists (select 1 from teams where id = p_team and league_id = lid and not is_guest) then raise exception 'That club isn''t in this league'; end if;
  select team_id into owner from squad where league_id = lid and player_id = p_player;
  if owner is not distinct from p_team then return json_build_object('ok', true); end if;
  if owner is not null then perform public.sq_take(lid, p_player); end if;
  if p_team is not null then perform public.sq_put(lid, p_player, p_team, 'Set by commish'); end if;
  update squad_flags set status = case when claimant_team_id = p_team then 'moved' else 'gone' end, resolved_at = now()
   where league_id = lid and player_id = p_player and status = 'open' and (claimant_team_id = p_team or p_team is null);
  return json_build_object('ok', true);
end $$;

-- Commish: settle a flag (move the player to the coach who flagged him, or keep him where he is).
create or replace function public.squad_flag_resolve(p_flag int, p_move boolean) returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.sq_guard(true); f squad_flags;
begin
  select * into f from squad_flags where id = p_flag and league_id = lid;
  if f.id is null or f.status <> 'open' then raise exception 'That flag is already sorted'; end if;
  if p_move then
    perform public.squad_admin_set(f.player_id, f.claimant_team_id);
    update squad_flags set status = 'moved', resolved_at = now() where id = p_flag;
  else
    update squad_flags set status = 'kept', resolved_at = now() where id = p_flag;
  end if;
  return json_build_object('ok', true);
end $$;

-- Commish: sign a squad off (p_on) or send it back to the coach.
create or replace function public.squad_approve(p_team int, p_on boolean) returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.sq_guard(true);
begin
  if not exists (select 1 from teams where id = p_team and league_id = lid) then raise exception 'That club isn''t in this league'; end if;
  insert into squad_setup (team_id, league_id, status, approved_at) values (p_team, lid, case when p_on then 'approved' else 'picking' end, case when p_on then now() end)
  on conflict (team_id) do update set status = case when p_on then 'approved' else 'picking' end,
    approved_at = case when p_on then now() end, submitted_at = case when p_on then squad_setup.submitted_at end, updated_at = now();
  return json_build_object('ok', true);
end $$;

-- Commish: lock squads (league goes live) or unlock them to fix something.
create or replace function public.squad_lock(p_on boolean) returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.current_league();
begin
  if lid = 1 then raise exception 'G-Train''s lists are already set'; end if;
  if not public.is_commish() then raise exception 'Only the commish can do that'; end if;
  update leagues set squads_locked_at = case when p_on then now() end where id = lid;
  if p_on then update squad_flags set status = 'kept', resolved_at = now() where league_id = lid and status = 'open'; end if;
  return json_build_object('locked', p_on);
end $$;

-- Commish: who owns a pick (traded picks before the first season).
create or replace function public.squad_pick_owner(p_pick int, p_team int) returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.current_league();
begin
  if lid = 1 then raise exception 'G-Train''s picks are managed in the draft centre'; end if;
  if not public.is_commish() then raise exception 'Only the commish can do that'; end if;
  if not exists (select 1 from picks where id = p_pick and league_id = lid) then raise exception 'Unknown pick'; end if;
  if not exists (select 1 from teams where id = p_team and league_id = lid and not is_guest) then raise exception 'That club isn''t in this league'; end if;
  update picks set owner_team_id = p_team where id = p_pick and league_id = lid;
  return json_build_object('ok', true);
end $$;

-- Commish: how squads get filled (picked by coaches, a fresh draft, or a spreadsheet import).
create or replace function public.set_setup_mode(p_mode text) returns json
language plpgsql security definer set search_path = public as $$
declare lid int := public.current_league();
begin
  if lid = 1 then raise exception 'G-Train''s lists are already set'; end if;
  if not public.is_commish() then raise exception 'Only the commish can do that'; end if;
  if p_mode not in ('picks', 'draft', 'import') then raise exception 'Unknown setup'; end if;
  update leagues set setup_mode = p_mode where id = lid;
  return json_build_object('mode', p_mode);
end $$;

revoke execute on function public.sq_guard(boolean), public.sq_put(int, int, int, text), public.sq_take(int, int) from public, anon, authenticated;
revoke execute on function public.squad_pick(int, boolean), public.squad_submit(), public.squad_flag(int), public.squad_admin_set(int, int),
  public.squad_flag_resolve(int, boolean), public.squad_approve(int, boolean), public.squad_lock(boolean), public.squad_pick_owner(int, int),
  public.set_setup_mode(text) from public, anon;
grant execute on function public.squad_pick(int, boolean), public.squad_submit(), public.squad_flag(int), public.squad_admin_set(int, int),
  public.squad_flag_resolve(int, boolean), public.squad_approve(int, boolean), public.squad_lock(boolean), public.squad_pick_owner(int, int),
  public.set_setup_mode(text) to authenticated;

grant create on schema public to khq_definer;
alter function public.sq_guard(boolean) owner to khq_definer;
alter function public.sq_put(int, int, int, text) owner to khq_definer;
alter function public.sq_take(int, int) owner to khq_definer;
alter function public.squad_pick(int, boolean) owner to khq_definer;
alter function public.squad_submit() owner to khq_definer;
alter function public.squad_flag(int) owner to khq_definer;
alter function public.squad_admin_set(int, int) owner to khq_definer;
alter function public.squad_flag_resolve(int, boolean) owner to khq_definer;
alter function public.squad_approve(int, boolean) owner to khq_definer;
alter function public.squad_lock(boolean) owner to khq_definer;
alter function public.squad_pick_owner(int, int) owner to khq_definer;
alter function public.set_setup_mode(text) owner to khq_definer;
revoke create on schema public from khq_definer;
