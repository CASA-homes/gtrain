-- Contract rules v3:
--  • Clause salary: standard +0%, high +10%, no clause +25%.
--  • Clause is fixed for each deal; coaches change it only by extending (the new years carry the new clause).
--  • Extension = market value now (home-grown discount first) +10% premium, plus a flat KT fee to the league,
--    and the deal is then locked for 12 months (no further extension).
--  • Year-1 cleanup: rookie-style starting contracts repriced to market value like the others.
alter table public.kc_settings add column if not exists ext_premium_pct int not null default 10 check (ext_premium_pct between 0 and 100);
alter table public.kc_settings add column if not exists ext_fee_kt int not null default 10 check (ext_fee_kt between 0 and 10000);
alter table public.kc_contracts add column if not exists locked_until timestamptz;
update public.kc_settings set none_pct = 25, high_pct = 10;

create table if not exists public.kc_contracts_backup_rookie_20261116 as select * from public.kc_contracts where how = 'rookie' and status in ('active', 'pending');
alter table public.kc_contracts_backup_rookie_20261116 enable row level security;
update public.kc_contracts c set base_k = greatest(5, round(public.kc_rate(c.player_id) * case when c.home_grown then (100 - k.home_grown_pct) / 100.0 else 1 end))::int, updated_at = now()
  from public.kc_settings k where k.league_id = c.league_id and c.how = 'rookie' and c.status in ('active', 'pending');
-- Every live salary re-derived from its base and clause level (picks up the new +25% for no clause).
update public.kc_contracts c set salary_k = round(c.base_k * (1 + case c.tier when 'high' then k.high_pct when 'none' then k.none_pct else 0 end / 100.0))::int,
       clause_kt = public.kc_clause_at(c.player_id, c.tier, c.league_id)
  from public.kc_settings k where k.league_id = c.league_id and c.status in ('active', 'pending') and c.how in ('seed', 'rookie');
update public.kc_contracts c set salary_k = round(c.base_k * (1 + k.none_pct / 100.0))::int
  from public.kc_settings k where k.league_id = c.league_id and c.status in ('active', 'pending') and c.tier = 'none' and c.how not in ('seed', 'rookie');

create or replace function public.kc_set_tier(cid bigint, new_tier text) returns void language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings;
begin
  if not public.is_commish() then raise exception 'A release clause is fixed for the deal. Change it with an extension'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status in ('active', 'pending') and league_id = public.current_league() for update;
  if c is null then raise exception 'No such contract'; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  update kc_contracts set tier = new_tier, salary_k = round(base_k * (1 + case new_tier when 'high' then k.high_pct when 'none' then k.none_pct else 0 end / 100.0))::int, updated_at = now() where id = cid;
end $$;

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
  if c.locked_until is not null and c.locked_until > now() then
    raise exception 'He was extended recently. He can be extended again from %', to_char(c.locked_until at time zone 'Australia/Perth', 'DD Mon YYYY');
  end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  last_yr := k.season + k.max_years - 1;
  if p_years < 1 or c.end_season + p_years > last_yr then
    raise exception 'He can be signed to % at most (% more year%)', last_yr, greatest(0, last_yr - c.end_season), case when last_yr - c.end_season = 1 then '' else 's' end;
  end if;
  if public.kc_bank(c.team_id) < k.ext_fee_kt then raise exception 'An extension costs a % KT fee. You have %', k.ext_fee_kt, public.kc_bank(c.team_id); end if;
  base := greatest(5, round(public.kc_rate(c.player_id) * case when c.home_grown then (100 - k.home_grown_pct) / 100.0 else 1 end * (100 + k.ext_premium_pct) / 100.0))::int;
  sal := round(base * public.kc_premium(new_tier))::int;
  if k.ext_fee_kt > 0 then perform public.kc_pay(c.team_id, -k.ext_fee_kt, 'Extension fee: ' || public.kc_pname(c.player_id)); end if;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status, locked_until)
  values (c.player_id, c.team_id, base, sal, c.end_season + 1, c.end_season + p_years, new_tier, false, c.home_grown, 'extension', 'pending', now() + interval '12 months');
  update kc_contracts set locked_until = now() + interval '12 months' where id = c.id;
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'extension', k.ext_fee_kt, 0, p_years || ' more yrs at $' || sal || 'k from ' || (c.end_season + 1) || ' (' || k.ext_fee_kt || ' KT fee)');
  return sal;
end $$;

grant create on schema public to khq_definer;
alter function public.kc_set_tier(bigint, text) owner to khq_definer;
alter function public.kc_extend(bigint, int, text) owner to khq_definer;
revoke create on schema public from khq_definer;
