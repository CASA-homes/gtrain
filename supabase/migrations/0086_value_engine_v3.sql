-- 0086 · Value engine v3: slow, long-memory market values. One number for contracts, clauses and the market.
--
--   • Average: career average where each older season counts 40% less per year (0.6^years back). This season's games
--     count in full and add to everything before, so the average moves a little each game and doesn't jump when a new
--     season starts.
--   • Value: 0.03 × (average − 45)², floor $10k. From 30, −5% a year (never below 70%). No experience multiplier: young
--     players no longer rise every year for free.
--   • Weekly cap: value moves towards that target by at most 4% a game. The path starts at the 2026 season and steps
--     game by game (player_seasons.games_log), so it's the same number every time it's worked out.
--   • League draft prices are the base: a player taken in the league's draft (or seeded as a rookie) starts that season
--     at his draft salary, never below $10k, then moves like everyone else.
--   • kc_draft_salary never goes below the $10k floor.
-- Signed contracts keep their salary and their fixed clause.

create or replace function public.kc_value_path(p_hist jsonb, p_logs jsonb, p_age int, p_season int,
                                                p_anchor_season int default null, p_anchor_k numeric default null)
returns numeric[] language plpgsql immutable set search_path = public as $$
declare
  yrs int[]; gs numeric[]; avs numeric[];
  steps int[]; y int; i int; v numeric; t numeric; wb numeric; sb numeric; k int; s numeric; sc numeric;
  agef numeric := case when p_age is null or p_age < 30 then 1.0 else greatest(0.7, 1 - 0.05 * (p_age - 29)) end;
  out numeric[] := '{}'; first boolean := true; scores numeric[];
begin
  select coalesce(array_agg((h->>0)::int order by (h->>0)::int), '{}'), coalesce(array_agg((h->>1)::numeric order by (h->>0)::int), '{}'),
         coalesce(array_agg((h->>2)::numeric order by (h->>0)::int), '{}')
    into yrs, gs, avs
    from jsonb_array_elements(coalesce(p_hist, '[]')) h where (h->>1)::numeric > 0;

  -- Seasons to walk: 2026 on (the first with game logs), plus the league's season.
  select coalesce(array_agg(distinct x order by x), '{}') into steps from (
    select unnest(yrs) x union select (jsonb_object_keys(coalesce(p_logs, '{}')))::int union select p_season
  ) z where x >= least(2026, p_season) and x <= p_season;

  foreach y in array steps loop
    if y > p_season then exit; end if;
    wb := 0; sb := 0;
    for i in 1 .. coalesce(array_length(yrs, 1), 0) loop
      if yrs[i] < y then wb := wb + gs[i] * power(0.6, y - yrs[i]); sb := sb + gs[i] * avs[i] * power(0.6, y - yrs[i]); end if;
    end loop;
    t := case when wb > 0 then greatest(10, 0.03 * power(greatest(0, sb / wb - 45), 2)) * agef else 10 end;
    if first then v := t; first := false; else v := least(v * 1.04, greatest(v * 0.96, t)); end if;
    if y = p_anchor_season then v := greatest(10, p_anchor_k); end if;
    out := out || round(v, 2);

    -- This season's games, in order: the logged scores, else his average repeated for each game he played.
    if p_logs ? y::text and jsonb_array_length(p_logs -> y::text) > 0 then
      -- games_log rows are [round, fantasy points, TOG %, kick-ins]; a bare number also works.
      select coalesce(array_agg(case when jsonb_typeof(e) = 'array' then (e->>1)::numeric else (e #>> '{}')::numeric end order by ord), '{}') into scores
        from jsonb_array_elements(p_logs -> y::text) with ordinality as a(e, ord)
       where (jsonb_typeof(e) = 'array' and jsonb_typeof(e->1) = 'number') or jsonb_typeof(e) = 'number';
    else
      scores := '{}';
      for i in 1 .. coalesce(array_length(yrs, 1), 0) loop
        if yrs[i] = y then scores := array_fill(avs[i], array[gs[i]::int]); end if;
      end loop;
    end if;
    k := 0; s := 0;
    foreach sc in array scores loop
      k := k + 1; s := s + sc;
      t := greatest(10, 0.03 * power(greatest(0, (s + sb) / (k + wb) - 45), 2)) * agef;
      v := least(v * 1.04, greatest(v * 0.96, t));
      out := out || round(v, 2);
    end loop;
  end loop;
  if array_length(out, 1) is null then out := array[10::numeric]; end if;
  return out;
end $$;

-- A player's value now in a league: his path up to the league's season, anchored at a draft (or rookie) salary.
create or replace function public.kc_value_now(pid int, p_league int) returns int
language sql stable security definer set search_path = public as $$
  with k as (select coalesce(season, 2027) season from kc_settings where league_id = p_league),
  a as (
    select c.start_season, c.salary_k from kc_contracts c
     where c.player_id = pid and c.league_id = p_league and c.how in ('draft', 'rookie') and c.status <> 'voided'
     order by c.start_season desc, c.id desc limit 1
  ),
  l as (select coalesce(jsonb_object_agg(ps.season::text, ps.games_log) filter (where ps.games_log is not null and ps.season >= 2026), '{}') logs
          from player_seasons ps where ps.player_id = pid)
  select round(x[array_length(x, 1)])::int from (
    select public.kc_value_path(p.hist, l.logs,
             date_part('year', age(make_date(coalesce((select season from k), 2027), 3, 1), p.birth_date))::int,
             coalesce((select season from k), 2027), (select start_season from a), (select salary_k from a)) x
      from players p, l where p.id = pid
  ) z
$$;

create or replace function public.kc_rate_calc(pid integer, p_league integer) returns integer
language sql stable security definer set search_path = public as $$
  select public.kc_value_now(pid, p_league)
$$;

create or replace function public.kc_refresh_rates(p_league integer default null, p_player integer default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into kc_rate_cache (league_id, player_id, rate_k, updated_at)
  select k.league_id, p.id, public.kc_value_now(p.id, k.league_id), now()
    from players p cross join kc_settings k
   where (p_league is null or k.league_id = p_league) and (p_player is null or p.id = p_player)
  on conflict (league_id, player_id) do update set rate_k = excluded.rate_k, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

-- New scores (player_seasons) and new draft or rookie contracts move values too.
create or replace function public.kc_rate_cache_scores() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.kc_refresh_rates(null, new.player_id);
  return null;
end $$;
drop trigger if exists kc_rate_cache_scores on public.player_seasons;
create trigger kc_rate_cache_scores after insert or update of games_log, games, average on public.player_seasons
  for each row execute function public.kc_rate_cache_scores();

create or replace function public.kc_rate_cache_contract() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.how in ('draft', 'rookie') then perform public.kc_refresh_rates(new.league_id, new.player_id); end if;
  return null;
end $$;
drop trigger if exists kc_rate_cache_contract on public.kc_contracts;
create trigger kc_rate_cache_contract after insert or update of salary_k, start_season, status on public.kc_contracts
  for each row execute function public.kc_rate_cache_contract();

-- Draft prices never go under the $10k floor (a rookie at half of a $10k late pick was $5k).
create or replace function public.kc_draft_salary(p_overall integer, rnd integer, rookie boolean)
returns integer language sql stable set search_path = public as $$
  select greatest(10, ceil((case when rnd <= 1 and coalesce(p_overall, 99) <= 10 then coalesce(k.draft_r1_k, 30)
                    when rnd <= 2 then coalesce(k.draft_r2_k, 25) when rnd = 3 then coalesce(k.draft_r3_k, 20)
                    when rnd = 4 then coalesce(k.draft_r4_k, 15) else coalesce(k.draft_rest_k, 10) end)
              * case when rookie then coalesce(k.rookie_pct, 50) / 100.0 else 1 end)::int)
  from (select 1) x left join kc_settings k on k.league_id = public.current_league()
$$;

-- These stay owned by postgres, like kc_refresh_rates before: they read every league's settings and contracts.

-- Every league's values, recomputed now.
select public.kc_refresh_rates(null, null);
