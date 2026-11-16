-- Availability discount only for a finished season: while the current (live) season is being played there is no
-- games-played discount; once a season is complete, a player who missed games is priced down (80% + 20% × games/18).
create or replace function public.kc_rate_v2(p_hist jsonb, p_age int, p_live int) returns int language plpgsql immutable as $$
declare n int; s0 int; g0 numeric := 0; a0 numeric := 0; g1 numeric; a1 numeric; g2 numeric; a2 numeric; prior numeric; w0 numeric; w1 numeric := 0; w2 numeric := 0;
        avg numeric; xp numeric; agef numeric; avail numeric;
begin
  select count(*) into n from jsonb_array_elements(coalesce(p_hist, '[]')) h where (h->>1)::numeric > 0;
  if n = 0 then return 5; end if;
  select (h->>0)::int, (h->>1)::numeric, (h->>2)::numeric into s0, g0, a0 from jsonb_array_elements(p_hist) h where (h->>1)::numeric > 0 order by (h->>0)::int desc limit 1;
  select (h->>1)::numeric, (h->>2)::numeric into g1, a1 from jsonb_array_elements(p_hist) h where (h->>1)::numeric > 0 order by (h->>0)::int desc offset 1 limit 1;
  select (h->>1)::numeric, (h->>2)::numeric into g2, a2 from jsonb_array_elements(p_hist) h where (h->>1)::numeric > 0 order by (h->>0)::int desc offset 2 limit 1;
  prior := greatest(6, 22 - g0);
  w0 := g0;
  if g1 is not null then w1 := 0.65 * prior * least(1, g1 / 10.0); end if;
  if g2 is not null then w2 := 0.35 * prior * least(1, g2 / 10.0); end if;
  avg := (w0 * a0 + w1 * coalesce(a1, 0) + w2 * coalesce(a2, 0)) / nullif(w0 + w1 + w2, 0);
  xp := case when n + 1 <= 1 then 0.5 when n + 1 = 2 then 0.6 when n + 1 = 3 then 0.7 when n + 1 = 4 then 0.85 else 1.0 end;
  agef := case when p_age is null or p_age < 30 then 1.0 else greatest(0.6, 1 - 0.08 * (p_age - 29)) end;
  avail := case when p_live is not null and s0 >= p_live then 1.0 else 0.8 + 0.2 * least(1, g0 / 18.0) end;
  return greatest(5, round(power(greatest(coalesce(avg, 0) - 55, 0), 1.3) * 0.66 * xp * agef * avail))::int;
end $$;

create or replace function public.kc_rate_v2(p_hist jsonb, p_age int) returns int language sql immutable as $$
  select public.kc_rate_v2(p_hist, p_age, null)
$$;

create or replace function public.kc_rate(pid int) returns int language sql stable security definer set search_path = public as $$
  select public.kc_rate_v2(p.hist,
           date_part('year', age(make_date(coalesce(k.season, 2027), 3, 1), p.birth_date))::int, k.season)
    from players p left join kc_settings k on k.league_id = public.current_league() where p.id = pid
$$;

grant create on schema public to khq_definer;
alter function public.kc_rate(int) owner to khq_definer;
revoke create on schema public from khq_definer;
