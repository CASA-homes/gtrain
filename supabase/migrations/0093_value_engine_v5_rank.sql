-- 0093 · Value engine v5: price by rank.
--
--   • Average: his last 30 games across seasons, as before.
--   • Price: by where that average ranks among every player's current 30-game average, so the best player is always the
--     most expensive and the crowded 85–100 band is spread out:
--       $k = 10 + 25·e^(−(rank−1)/25) + 60·e^(−(rank−1)/200)
--     #1 $95k · #10 $85k · #20 $76k · #50 $61k · #100 $47k · #180 $35k.
--     The ranking (kc_value_table) holds every player with at least 10 games in his window, rebuilt with every full refresh. Past points on a player's path
--     are priced against today's table, so his history reads on the same scale as his price now.
--   • Fewer than 30 games: the missing games count at his starting price (league draft price, else AFL pick), so a kid
--     starts at what the league set and grows into his rank. Below a 60 average the price tapers to $10k at 45.
--     Never under $10k.
--   • From 30, −5% a year (never below 70%), as before.
--   • Safety net: at most 10% a game (was 5%). Over a 30-game window it should almost never bite.
-- One number for contracts, clauses and the market. Signed contracts keep their salary and their fixed clause.

create table if not exists public.kc_value_table (
  id int primary key default 1 check (id = 1),
  avgs numeric[] not null default '{}',   -- every player's current 30-game average, highest first
  updated_at timestamptz not null default now()
);
alter table public.kc_value_table enable row level security;
drop policy if exists "value table readable" on public.kc_value_table;
create policy "value table readable" on public.kc_value_table for select using (true);
grant select on public.kc_value_table to anon, authenticated;
insert into public.kc_value_table (id) values (1) on conflict do nothing;

-- Price for a rank (1 = best).
create or replace function public.kc_rank_price(p_rank numeric) returns numeric language sql immutable as $$
  select 10 + 25 * exp(-(greatest(p_rank, 1) - 1) / 25.0) + 60 * exp(-(greatest(p_rank, 1) - 1) / 200.0)
$$;

-- Rank of an average against a table sorted highest first: 1 + how many averages sit above it (binary search).
create or replace function public.kc_rank_of(p_avg numeric, p_tbl numeric[]) returns int language plpgsql immutable as $$
declare lo int := 1; hi int := coalesce(array_length(p_tbl, 1), 0); mid int;
begin
  -- First index whose average is not above p_avg.
  while lo <= hi loop
    mid := (lo + hi) / 2;
    if p_tbl[mid] > p_avg then lo := mid + 1; else hi := mid - 1; end if;
  end loop;
  return lo;
end $$;

-- After each game from the start of 2026 (the first entry is where 2026 began): {average of his real games in the
-- last-30 window (null with none), how many real games that is}.
create or replace function public.kc_value_steps(p_hist jsonb, p_logs jsonb, p_season int)
returns numeric[] language plpgsql immutable set search_path = public as $$
declare
  games numeric[] := '{}'; sc numeric[]; h record; i0 int := 0; n int; i int; j int; s numeric; g int;
  out numeric[] := '{}';
begin
  for h in select (e->>0)::int y, (e->>1)::numeric g, (e->>2)::numeric a from jsonb_array_elements(coalesce(p_hist, '[]')) e
           where (e->>1)::numeric > 0 and (e->>0)::int <= p_season order by 1 loop
    if p_logs ? h.y::text and jsonb_array_length(p_logs -> h.y::text) > 0 then
      select coalesce(array_agg(case when jsonb_typeof(x) = 'array' then (x->>1)::numeric else (x #>> '{}')::numeric end order by o), '{}') into sc
        from jsonb_array_elements(p_logs -> h.y::text) with ordinality q(x, o)
       where (jsonb_typeof(x) = 'array' and jsonb_typeof(x->1) = 'number') or jsonb_typeof(x) = 'number';
    else
      sc := array_fill(h.a, array[h.g::int]);
    end if;
    if h.y < 2026 then i0 := i0 + coalesce(array_length(sc, 1), 0); end if;
    games := games || sc;
  end loop;
  n := coalesce(array_length(games, 1), 0);
  for i in i0 .. n loop
    s := 0; g := 0;
    for j in greatest(1, i - 29) .. i loop
      if j >= 1 then s := s + games[j]; g := g + 1; end if;
    end loop;
    out := out || array[[case when g > 0 then round(s / g, 3) end, g::numeric]];
  end loop;
  return out;
end $$;

-- Price for a real average: by rank; below a 60 average it tapers to the $10k floor at 45 (so the fringe isn't all
-- priced alike).
create or replace function public.kc_price_for_avg(p_avg numeric, p_tbl numeric[]) returns numeric language sql immutable as $$
  select case when coalesce(array_length(p_tbl, 1), 0) = 0 then public.kc_value_curve(p_avg)
              when p_avg < 60 then least(public.kc_rank_price(public.kc_rank_of(p_avg, p_tbl)), public.kc_value_curve(p_avg))
              else public.kc_rank_price(public.kc_rank_of(p_avg, p_tbl)) end
$$;

-- Value after each game from the start of 2026. With 30 games it's his rank price; with fewer, the missing games count
-- at his starting price (league draft price or AFL pick), so a kid starts at what the league set and grows into his
-- rank. × age factor, and at most 10% a game.
create or replace function public.kc_value_path(p_hist jsonb, p_logs jsonb, p_age int, p_season int, p_start_k numeric default 10)
returns numeric[] language plpgsql stable set search_path = public as $$
declare
  agef numeric := case when p_age is null or p_age < 30 then 1.0 else greatest(0.7, 1 - 0.05 * (p_age - 29)) end;
  base numeric := greatest(10, coalesce(p_start_k, 10));
  tbl numeric[] := (select avgs from kc_value_table where id = 1);
  st numeric[] := public.kc_value_steps(p_hist, p_logs, p_season);
  i int; g numeric; v numeric; t numeric; out numeric[] := '{}';
begin
  for i in 1 .. coalesce(array_length(st, 1), 0) loop
    g := st[i][2];
    t := (case when g > 0 then g / 30 * public.kc_price_for_avg(st[i][1], tbl) else 0 end + (30 - g) / 30 * base) * agef;
    t := greatest(10, t);
    v := case when i = 1 then t else least(v * 1.10, greatest(v * 0.90, t)) end;
    out := out || round(v, 2);
  end loop;
  return out;
end $$;

-- Rebuild the ranking: every player's current average over his last 30 games, for players with at least 10 of them.
create or replace function public.kc_value_rebuild_table() returns int
language plpgsql security definer set search_path = public as $$
declare n int; yr int := coalesce((select season from kc_settings order by league_id limit 1), 2027);
begin
  with l as (
    select ps.player_id, jsonb_object_agg(ps.season::text, ps.games_log) filter (where ps.games_log is not null) logs
      from player_seasons ps group by ps.player_id),
  s as (select public.kc_value_steps(p.hist, coalesce(l.logs, '{}'), yr) st from players p left join l on l.player_id = p.id),
  a as (select st[array_length(st, 1)][1] avg, st[array_length(st, 1)][2] g from s where array_length(st, 1) > 0)
  update kc_value_table set avgs = (select coalesce(array_agg(avg order by avg desc), '{}') from a where g >= 10), updated_at = now()
   where id = 1;
  select array_length(avgs, 1) into n from kc_value_table where id = 1;
  return n;
end $$;

-- A full refresh rebuilds the ranking first; a single-player refresh prices him against the current ranking.
create or replace function public.kc_refresh_rates(p_league integer default null, p_player integer default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_player is null then perform public.kc_value_rebuild_table(); end if;
  insert into kc_rate_cache (league_id, player_id, rate_k, updated_at)
  select k.league_id, p.id, public.kc_value_now(p.id, k.league_id), now()
    from players p cross join kc_settings k
   where (p_league is null or k.league_id = p_league) and (p_player is null or p.id = p_player)
  on conflict (league_id, player_id) do update set rate_k = excluded.rate_k, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.kc_refresh_rates(integer, integer) from anon, public;
revoke execute on function public.kc_value_rebuild_table() from anon, public, authenticated;

-- New scores re-rank everyone once per statement (a score import is one statement), on top of the per-player refresh.
create or replace function public.kc_rate_cache_rerank() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.kc_refresh_rates(null, null);
  return null;
end $$;
drop trigger if exists kc_rate_cache_rerank on public.player_seasons;
create trigger kc_rate_cache_rerank after insert or update of games_log, games, average on public.player_seasons
  for each statement execute function public.kc_rate_cache_rerank();

-- Every league's values, recomputed now (this rebuilds the ranking first).
select public.kc_refresh_rates(null, null);
