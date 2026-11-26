-- 0088 · Value engine v4: a player's value is his last 30 games.
--
--   • Average: his last 30 games, across seasons (logged scores where we have them, else his season average for each
--     game he played). A player with fewer than 30 games is topped up with "starting games" at the average his
--     starting price implies: his league draft salary if he was drafted on the site, else his AFL draft pick
--     (picks 1–10 the league's R1 price, 11–25 R2, 26–45 R3, 46–70 R4, everyone else the R5+ price), never under $10k.
--   • Value: $0.65k per point of average from 60 up (a 90 average is $58.5k), sized so clubs' best 17 sit around the
--     keeper cap; below 60 it drops to the $10k floor at 45.
--     From 30, −5% a year (never below 70%).
--   • Weekly cap: at most 5% a game, from the start of 2026.
-- One number for contracts, clauses and the market. Signed contracts keep their salary and their fixed clause.

create or replace function public.kc_value_curve(p_avg numeric) returns numeric language sql immutable as $$
  select case when p_avg >= 60 then 0.65 * p_avg when p_avg <= 45 then 10 else 10 + (p_avg - 45) * (0.65 * 60 - 10) / 15.0 end
$$;
create or replace function public.kc_value_curve_inv(p_k numeric) returns numeric language sql immutable as $$
  select case when p_k >= 39 then p_k / 0.65 when p_k <= 10 then 45 else 45 + (p_k - 10) * 15 / (0.65 * 60 - 10) end
$$;

drop function if exists public.kc_value_path(jsonb, jsonb, int, int, int, numeric);
create or replace function public.kc_value_path(p_hist jsonb, p_logs jsonb, p_age int, p_season int, p_start_k numeric default 10)
returns numeric[] language plpgsql immutable set search_path = public as $$
declare
  agef numeric := case when p_age is null or p_age < 30 then 1.0 else greatest(0.7, 1 - 0.05 * (p_age - 29)) end;
  pad numeric := public.kc_value_curve_inv(greatest(10, coalesce(p_start_k, 10)));
  games numeric[] := '{}'; sc numeric[]; h record; i0 int := 0; n int; i int; j int; s numeric; v numeric; t numeric;
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
  -- Value after game i (i = i0 is the start of 2026): the average of the 30 games up to it, topped up with starting games.
  for i in i0 .. n loop
    s := 0;
    for j in (i - 29) .. i loop
      s := s + case when j >= 1 then games[j] else pad end;
    end loop;
    t := public.kc_value_curve(s / 30) * agef;
    v := case when i = i0 then t else least(v * 1.05, greatest(v * 0.95, t)) end;
    out := out || round(v, 2);
  end loop;
  return out;
end $$;

-- Starting price: the league draft (or rookie) contract if there is one, else his AFL draft pick on this league's prices.
create or replace function public.kc_start_price(pid int, p_league int) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(10, coalesce(
    (select c.salary_k from kc_contracts c where c.player_id = pid and c.league_id = p_league and c.how in ('draft', 'rookie') and c.status <> 'voided'
      order by c.start_season, c.id limit 1),
    (select case when p.draft_pick is null then coalesce(k.draft_rest_k, 10)
                 when p.draft_pick <= 10 then coalesce(k.draft_r1_k, 30) when p.draft_pick <= 25 then coalesce(k.draft_r2_k, 25)
                 when p.draft_pick <= 45 then coalesce(k.draft_r3_k, 20) when p.draft_pick <= 70 then coalesce(k.draft_r4_k, 15)
                 else coalesce(k.draft_rest_k, 10) end
       from players p left join kc_settings k on k.league_id = p_league where p.id = pid), 10))
$$;

create or replace function public.kc_value_now(pid int, p_league int) returns int
language sql stable security definer set search_path = public as $$
  with k as (select coalesce(season, 2027) season from kc_settings where league_id = p_league),
  l as (select coalesce(jsonb_object_agg(ps.season::text, ps.games_log) filter (where ps.games_log is not null), '{}') logs
          from player_seasons ps where ps.player_id = pid)
  select round(x[array_length(x, 1)])::int from (
    select public.kc_value_path(p.hist, l.logs,
             date_part('year', age(make_date(coalesce((select season from k), 2027), 3, 1), p.birth_date))::int,
             coalesce((select season from k), 2027), public.kc_start_price(pid, p_league)) x
      from players p, l where p.id = pid
  ) z
$$;

-- Every league's values, recomputed now.
select public.kc_refresh_rates(null, null);
