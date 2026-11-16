-- Speed: store market values instead of recalculating them, and give the site a cheap "has anything changed?" stamp
-- so it can reuse league data between visitors.
--  • kc_rate_cache holds every player's market value per league. It refreshes when a player's history or birth date
--    changes, and for the whole league when the season changes. kc_rate / kc_rates read it (falling back to a live
--    calculation if a row is missing).
--  • data_version is bumped by any change to the tables the league pages load. data_stamp() returns it to league
--    members (null for anyone else).

create table if not exists public.kc_rate_cache (
  league_id int not null,
  player_id int not null,
  rate_k int not null,
  updated_at timestamptz not null default now(),
  primary key (league_id, player_id)
);
alter table public.kc_rate_cache enable row level security;

create or replace function public.kc_rate_calc(pid int, p_league int) returns int language sql stable security definer set search_path = public as $$
  select public.kc_rate_v2(p.hist, date_part('year', age(make_date(coalesce(k.season, 2027), 3, 1), p.birth_date))::int, k.season)
    from players p left join kc_settings k on k.league_id = p_league where p.id = pid
$$;

create or replace function public.kc_refresh_rates(p_league int default null, p_player int default null) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into kc_rate_cache (league_id, player_id, rate_k, updated_at)
  select k.league_id, p.id, public.kc_rate_v2(p.hist, date_part('year', age(make_date(coalesce(k.season, 2027), 3, 1), p.birth_date))::int, k.season), now()
    from players p cross join kc_settings k
   where (p_league is null or k.league_id = p_league) and (p_player is null or p.id = p_player)
  on conflict (league_id, player_id) do update set rate_k = excluded.rate_k, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.kc_rate(pid integer) returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select c.rate_k from kc_rate_cache c where c.league_id = public.current_league() and c.player_id = pid),
                  public.kc_rate_calc(pid, public.current_league()))
$$;

create or replace function public.kc_rates() returns table(player_id integer, rate_k integer) language sql stable security definer set search_path = public as $$
  select p.id, coalesce(c.rate_k, public.kc_rate_calc(p.id, public.current_league()))
    from players p left join kc_rate_cache c on c.player_id = p.id and c.league_id = public.current_league()
$$;

create or replace function public.kc_rate_cache_player() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.kc_refresh_rates(null, new.id);
  return null;
end $$;
drop trigger if exists kc_rate_cache_player on public.players;
create trigger kc_rate_cache_player after insert or update of hist, birth_date on public.players
  for each row execute function public.kc_rate_cache_player();

create or replace function public.kc_rate_cache_season() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.season is distinct from old.season then perform public.kc_refresh_rates(new.league_id, null); end if;
  return null;
end $$;
drop trigger if exists kc_rate_cache_season on public.kc_settings;
create trigger kc_rate_cache_season after insert or update of season on public.kc_settings
  for each row execute function public.kc_rate_cache_season();

-- Data stamp
create table if not exists public.data_version (id int primary key default 1 check (id = 1), v bigint not null default 1, updated_at timestamptz not null default now());
alter table public.data_version enable row level security;
insert into public.data_version (id, v) values (1, 1) on conflict do nothing;

create or replace function public.bump_data_version() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update data_version set v = v + 1, updated_at = now() where id = 1;
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['teams', 'squad', 'players', 'player_seasons', 'seasons', 'ladder', 'picks'] loop
    execute format('drop trigger if exists bump_data_version on public.%I', t);
    execute format('create trigger bump_data_version after insert or update or delete or truncate on public.%I for each statement execute function public.bump_data_version()', t);
  end loop;
end $$;

create or replace function public.data_stamp() returns bigint language sql stable security definer set search_path = public as $$
  select case when public.is_member() then (select v from data_version where id = 1) end
$$;
grant execute on function public.data_stamp() to authenticated, anon;

select public.kc_refresh_rates();
