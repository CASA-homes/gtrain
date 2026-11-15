-- Market rate: judge availability on games played out of rounds played so far, not out of a full season, so a
-- player who hasn't missed a game counts as fully available at any point in the year. Rounds so far = the most games
-- any player has played that season. Missing about 1 game in 8 is still treated as full availability, as before.
create or replace function public.kc_rate(pid int) returns int language sql stable security definer set search_path = public as $$
  with s as (
    select average, games, season, row_number() over (order by season desc) rn
      from player_seasons where player_id = pid and average is not null and coalesce(games, 0) > 0
  ), w as (
    select sum(average * games * case when rn = 1 then 1.5 else 1 end) / nullif(sum(games * case when rn = 1 then 1.5 else 1 end), 0) avg,
           max(games) filter (where rn = 1) g,
           max(season) filter (where rn = 1) yr
      from s where rn <= 2
  ), r as (
    select greatest(1, coalesce((select max(games) from player_seasons ps where ps.season = w.yr), 23)) rounds from w
  )
  select public.kc_rate_from(w.avg, round(least(1.0, w.g / (0.87 * r.rounds)) * 20)::int,
           date_part('year', age(make_date(coalesce((select season from kc_settings where league_id = public.current_league()), 2027), 3, 1), p.birth_date))::int)
    from w, r, players p where p.id = pid
$$;
grant create on schema public to khq_definer;
alter function public.kc_rate(int) owner to khq_definer;
revoke create on schema public from khq_definer;
