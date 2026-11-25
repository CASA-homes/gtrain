-- 0080: fix "Set up contracts" (kc_seed).
-- kc_draft_salary now takes (overall pick, round, rookie), but kc_seed still called it with (round, rookie),
-- so the button failed with "function public.kc_draft_salary(integer, boolean) does not exist".
-- Only change: rookie keepers are priced with kc_draft_salary(draft_pick, round, true). Everything else is as before.

create or replace function public.kc_seed()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare k kc_settings; n int; top int;
begin
  if not public.is_commish() then raise exception 'Only the commish can set up contracts'; end if;
  insert into kc_settings (league_id, season) values (public.current_league(), coalesce((select season from leagues where id = public.current_league()), 2027))
    on conflict (league_id) do nothing;
  select * into k from kc_settings where league_id = public.current_league();
  if exists (select 1 from kc_contracts where league_id = public.current_league()) then raise exception 'Contracts are already set up for this league'; end if;

  with kept as (
    select s.player_id, s.team_id, s.is_rookie_keeper, p.debut_year, p.draft_pick,
           date_part('year', age(make_date(k.season, 3, 1), p.birth_date))::int yrs, public.kc_rate(p.id) rate
      from squad s join players p on p.id = s.player_id
     where s.league_id = public.current_league() and (s.is_keeper or s.is_rookie_keeper)
  ), shaped as (
    select *, (debut_year is not null and debut_year >= k.season - 3 and coalesce(yrs, 99) <= 23) is_rookie,
           row_number() over (partition by team_id order by rate desc) rk
      from kept
  ), lengths as (
    select *, case
        when is_rookie then greatest(1, least(3, debut_year + 3 - k.season + 1))
        when rk <= 3 and coalesce(yrs, 99) <= 27 and rate >= 60 then 4
        when coalesce(yrs, 99) <= 24 then 3
        when yrs <= 30 then 2
        else 1 end as len
      from shaped
  ), priced as (
    select *, case when is_rookie then public.kc_draft_salary(
                     draft_pick,
                     case when draft_pick is null then 4 when draft_pick <= 10 then 1 when draft_pick <= 25 then 2 when draft_pick <= 45 then 3 else 4 end,
                     true)
                   else greatest(5, round(rate * public.kc_length_factor(len)))::int end as base
      from lengths
  )
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how)
  select player_id, team_id, base, base, k.season, k.season + len - 1,
         case when is_rookie_keeper then 'protected' else 'standard' end, is_rookie, is_rookie, case when is_rookie then 'rookie' else 'seed' end
    from priced;
  get diagnostics n = row_count;

  insert into kc_ledger (team_id, delta, reason)
  select id, k.start_kt, k.season || ' starting bank' from teams where league_id = public.current_league() and not coalesce(is_guest, false);
  select max(public.kc_salary(team_id, k.season)) into top from (select distinct team_id from kc_contracts where league_id = public.current_league()) x;
  if top > k.keeper_cap_k then
    update kc_settings set keeper_cap_k = ceil(top / 50.0) * 50,
                           season_cap_k = greatest(season_cap_k, ceil(top / 50.0) * 50 + 250),
                           tax_line_k   = greatest(tax_line_k, ceil(top / 50.0) * 50 + 100)
     where league_id = public.current_league();
  end if;
  update kc_settings set seeded_at = now(), updated_at = now() where league_id = public.current_league();
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, n || ' contracts set up for the ' || k.season || ' shadow season');
  return n;
end $function$;
