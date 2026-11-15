-- Market value v2.
--  Average: this season blended with the last two (last season weighted 65/35 over the one before). The previous
--  seasons fill whatever this season is missing (22 rounds less games played), with a floor of 6 games' weight so a
--  full season still leans a little on history. Each new score moves the value only a little.
--  Experience: priced on the season he's about to play. 2nd season 60%, 3rd 70%, 4th 85%, 5th+ full price.
--  Age: from 30, 8% off a year (floor 60%). Availability: 80% + 20% × games this season / 18.
create or replace function public.kc_rate_v2(p_hist jsonb, p_age int) returns int language plpgsql immutable as $$
declare n int; g0 numeric := 0; a0 numeric := 0; g1 numeric; a1 numeric; g2 numeric; a2 numeric; prior numeric; w0 numeric; w1 numeric := 0; w2 numeric := 0;
        avg numeric; xp numeric; agef numeric; avail numeric;
begin
  select count(*) into n from jsonb_array_elements(coalesce(p_hist, '[]')) h where (h->>1)::numeric > 0;
  if n = 0 then return 5; end if;
  select (h->>1)::numeric, (h->>2)::numeric into g0, a0 from jsonb_array_elements(p_hist) h where (h->>1)::numeric > 0 order by (h->>0)::int desc limit 1;
  select (h->>1)::numeric, (h->>2)::numeric into g1, a1 from jsonb_array_elements(p_hist) h where (h->>1)::numeric > 0 order by (h->>0)::int desc offset 1 limit 1;
  select (h->>1)::numeric, (h->>2)::numeric into g2, a2 from jsonb_array_elements(p_hist) h where (h->>1)::numeric > 0 order by (h->>0)::int desc offset 2 limit 1;
  prior := greatest(6, 22 - g0);
  w0 := g0;
  if g1 is not null then w1 := 0.65 * prior * least(1, g1 / 10.0); end if;
  if g2 is not null then w2 := 0.35 * prior * least(1, g2 / 10.0); end if;
  avg := (w0 * a0 + w1 * coalesce(a1, 0) + w2 * coalesce(a2, 0)) / nullif(w0 + w1 + w2, 0);
  xp := case when n + 1 <= 1 then 0.5 when n + 1 = 2 then 0.6 when n + 1 = 3 then 0.7 when n + 1 = 4 then 0.85 else 1.0 end;
  agef := case when p_age is null or p_age < 30 then 1.0 else greatest(0.6, 1 - 0.08 * (p_age - 29)) end;
  avail := 0.8 + 0.2 * least(1, g0 / 18.0);
  return greatest(5, round(power(greatest(coalesce(avg, 0) - 55, 0), 1.3) * 0.66 * xp * agef * avail))::int;
end $$;

create or replace function public.kc_rate(pid int) returns int language sql stable security definer set search_path = public as $$
  select public.kc_rate_v2(p.hist,
           date_part('year', age(make_date(coalesce((select season from kc_settings where league_id = public.current_league()), 2027), 3, 1), p.birth_date))::int)
    from players p where p.id = pid
$$;

-- Sign a player on your own list who has no contract (e.g. out of contract at season end), at his priced salary.
create or replace function public.kc_sign_own(pid int, p_years int, new_tier text) returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); t int; base int; sal int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select team_id into t from squad where player_id = pid and league_id = public.current_league();
  if t is null then raise exception 'He isn''t on a list'; end if;
  if t is distinct from me and not public.is_commish() then raise exception 'Only his club can sign him'; end if;
  if exists (select 1 from kc_contracts where player_id = pid and status in ('active', 'pending') and league_id = public.current_league()) then
    raise exception 'He already has a contract';
  end if;
  if p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  base := greatest(5, round(public.kc_rate(pid) * public.kc_length_factor(p_years)))::int;
  sal := round(base * public.kc_premium(new_tier))::int;
  if public.kc_salary(t, k.season) + sal > k.season_cap_k then
    raise exception 'His $%k would take you over the $%k cap in %', sal, k.season_cap_k, k.season;
  end if;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status)
  values (pid, t, base, sal, k.season, k.season + p_years - 1, new_tier, false, false, 'free_agent', 'active');
  perform public.kc_log(pid, t, t, 'free_agent', 0, 0, p_years || ' yrs at $' || sal || 'k from ' || k.season);
  return sal;
end $$;

grant create on schema public to khq_definer;
alter function public.kc_rate(int) owner to khq_definer;
alter function public.kc_sign_own(int, int, text) owner to khq_definer;
revoke create on schema public from khq_definer;
