-- Extend any time: add years on to the end of a current deal, up to max_years from this season.
-- The added years are priced at market value now (home-grown discount applies), plus the clause premium.
create or replace function public.kc_extend(cid bigint, p_years int, new_tier text) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; base int; sal int; last_yr int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can extend him'; end if;
  if public.kc_is_pending(c.player_id) then raise exception 'He''s a pending free agent now. Take an offer, or he goes to free agency at season end'; end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s agreed to join another club'; end if;
  if exists (select 1 from kc_contracts where player_id = c.player_id and status = 'pending' and league_id = public.current_league()) then
    raise exception 'He''s already extended';
  end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  last_yr := k.season + k.max_years - 1;
  if p_years < 1 or c.end_season + p_years > last_yr then
    raise exception 'He can be signed to % at most (% more year%)', last_yr, greatest(0, last_yr - c.end_season), case when last_yr - c.end_season = 1 then '' else 's' end;
  end if;
  base := greatest(5, round(public.kc_rate(c.player_id) * case when c.home_grown then (100 - k.home_grown_pct) / 100.0 else 1 end))::int;
  sal := round(base * public.kc_premium(new_tier))::int;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status)
  values (c.player_id, c.team_id, base, sal, c.end_season + 1, c.end_season + p_years, new_tier, false, c.home_grown, 'extension', 'pending');
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'extension', 0, 0, p_years || ' more yrs at $' || sal || 'k from ' || (c.end_season + 1));
  return sal;
end $$;

grant create on schema public to khq_definer;
alter function public.kc_extend(bigint, int, text) owner to khq_definer;
revoke create on schema public from khq_definer;
