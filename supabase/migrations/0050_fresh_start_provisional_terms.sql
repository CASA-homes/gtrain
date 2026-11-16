-- First off-season: every player starts unsigned; each club re-signs its own list.
--  • Until deadline day (setup_until) every signing is provisional: the club can undo it (free, no dead money) or lock it.
--    On deadline day everything becomes formal.
--  • Setup signings are home-grown (20% off) and priced by length. No KT fees until deadline day: extensions and
--    releases are free of fees during setup.
--  • Term deposits: 6 months (4%), 1 year (10%) or 2 years (25%). Collected once they mature (also paid at rollover).
--  • Changing a clause during setup now also resets the fixed clause amount.

alter table public.kc_contracts add column if not exists provisional boolean not null default false;
alter table public.kc_deposits add column if not exists term_months int not null default 12;
alter table public.kc_deposits add column if not exists matures_at timestamptz;

grant create on schema public to khq_definer;

create or replace function public.kc_in_setup() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(now() <= k.setup_until, false) from kc_settings k where k.league_id = public.current_league()
$$;

create or replace function public.kc_deposit_rate(p_months int) returns int language sql immutable as $$
  select case p_months when 6 then 4 when 12 then 10 when 24 then 25 end
$$;

-- Fresh start (commish, setup only): all contracts gone, every list unsigned, banks back to the start.
create or replace function public.kc_fresh_start() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; n int;
begin
  if not public.is_commish() then raise exception 'Only the commish can do that'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  if not public.kc_in_setup() then raise exception 'Only before deadline day in the first off-season'; end if;
  delete from kc_dead where league_id = k.league_id;
  delete from kc_bids where league_id = k.league_id;
  delete from kc_auctions where league_id = k.league_id;
  delete from kc_claims where league_id = k.league_id;
  delete from kc_offers where league_id = k.league_id;
  delete from kc_free_agents where league_id = k.league_id;
  delete from kc_cap_adjust where league_id = k.league_id;
  delete from kc_deposits where league_id = k.league_id;
  delete from kc_loans where league_id = k.league_id;
  delete from kc_contracts where league_id = k.league_id;
  get diagnostics n = row_count;
  delete from kc_ledger where league_id = k.league_id;
  insert into kc_ledger (league_id, team_id, delta, reason)
  select t.league_id, t.id, k.start_kt, k.season || ' starting bank' from teams t where t.league_id = k.league_id and not coalesce(t.is_guest, false);
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, 'Fresh start: every player is unsigned. Re-sign your list before deadline day.');
  return n;
end $$;

-- Sign your own player. In setup: home-grown, provisional, clause fixed at signing.
create or replace function public.kc_sign_own(pid integer, p_years integer, new_tier text) returns integer language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); t int; base int; sal int; r record; setup boolean := public.kc_in_setup();
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
  base := greatest(5, round(public.kc_rate(pid) * public.kc_length_factor(p_years) * case when setup then (100 - k.home_grown_pct) / 100.0 else 1 end))::int;
  sal := round(base * public.kc_premium(new_tier))::int;
  if public.kc_salary(t, k.season) + sal > k.season_cap_k then
    raise exception 'His $%k would take you over the $%k cap in %', sal, k.season_cap_k, k.season;
  end if;
  for r in select o.* from kc_offers o join kc_free_agents f on f.id = o.fa_id where f.player_id = pid and f.status = 'open' and f.kind = 'offseason' and o.status = 'tabled' and f.league_id = public.current_league() loop
    perform public.kc_pay(r.team_id, r.sweet_kt, 'Offer refunded: ' || public.kc_pname(pid));
    update kc_offers set status = 'lost', updated_at = now() where id = r.id;
  end loop;
  update kc_free_agents set status = 'signed', signed_team = t where player_id = pid and status = 'open' and kind = 'offseason' and league_id = public.current_league();
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status, provisional, clause_kt)
  values (pid, t, base, sal, k.season, k.season + p_years - 1, new_tier, false, setup, case when setup then 'seed' else 'free_agent' end, 'active', setup,
          case when new_tier = 'none' then null else public.kc_clause_at(pid, new_tier, k.league_id) end);
  perform public.kc_log(pid, t, t, case when setup then 'seed' else 'free_agent' end, 0, 0, p_years || ' yrs at $' || sal || 'k from ' || k.season || case when setup then ' (provisional)' else '' end);
  return sal;
end $$;

-- Undo a provisional signing (setup only): free, no dead money; any extension goes with it.
create or replace function public.kc_undo_contract(cid bigint) returns void language plpgsql security definer set search_path = public as $$
declare c kc_contracts;
begin
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can do that'; end if;
  if not public.kc_in_setup() then raise exception 'Contracts are formal now. Release him instead'; end if;
  if not c.provisional then raise exception 'You locked that contract. Release him instead'; end if;
  delete from kc_contracts where player_id = c.player_id and team_id = c.team_id and status = 'pending' and league_id = c.league_id;
  delete from kc_contracts where id = c.id;
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'seed', 0, 0, 'Provisional contract undone');
end $$;

-- Lock a provisional contract (or every one at a club, cid null with t set): it can't be undone after this.
create or replace function public.kc_lock_contracts(cid bigint, t int) returns int language plpgsql security definer set search_path = public as $$
declare tm int; n int;
begin
  if cid is not null then select team_id into tm from kc_contracts where id = cid and league_id = public.current_league(); else tm := t; end if;
  if tm is null then raise exception 'No such contract'; end if;
  if tm is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can do that'; end if;
  update kc_contracts set provisional = false, updated_at = now()
   where provisional and team_id = tm and league_id = public.current_league() and (cid is null or id = cid);
  get diagnostics n = row_count;
  return n;
end $$;

-- Clause changes in setup also refresh the fixed clause amount.
create or replace function public.kc_set_tier(cid bigint, new_tier text) returns void language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status in ('active', 'pending') and league_id = public.current_league() for update;
  if c is null then raise exception 'No such contract'; end if;
  if not public.is_commish() then
    if c.team_id is distinct from public.my_team_id() then raise exception 'Only his club can do that'; end if;
    if k.setup_until is null or now() > k.setup_until then raise exception 'A release clause is fixed for the deal. Change it with an extension'; end if;
    if c.tier = 'protected' then raise exception 'Protected rookies keep their protection this season'; end if;
  end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  update kc_contracts set tier = new_tier, salary_k = round(base_k * (1 + case new_tier when 'high' then k.high_pct when 'none' then k.none_pct else 0 end / 100.0))::int,
         clause_kt = case when new_tier = 'none' then null else public.kc_clause_at(c.player_id, new_tier, c.league_id) end, updated_at = now()
   where id = cid;
end $$;

-- Extensions: no fee and no 12-month lock during setup.
create or replace function public.kc_extend(cid bigint, p_years int, new_tier text) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; base int; sal int; last_yr int; setup boolean := public.kc_in_setup(); fee int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can extend him'; end if;
  if public.kc_is_pending(c.player_id) then raise exception 'He''s a pending free agent now. Take an offer, or he goes to free agency at season end'; end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s agreed to join another club'; end if;
  if c.draft_review then raise exception 'Answer his draft contract request first'; end if;
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
  fee := case when setup then 0 else k.ext_fee_kt end;
  if public.kc_bank(c.team_id) < fee then raise exception 'An extension costs a % KT fee. You have %', fee, public.kc_bank(c.team_id); end if;
  base := greatest(5, round(public.kc_rate(c.player_id) * public.kc_length_factor(p_years)
                            * case when c.home_grown then (100 - k.home_grown_pct) / 100.0 else 1 end * (100 + k.ext_premium_pct) / 100.0))::int;
  sal := round(base * public.kc_premium(new_tier))::int;
  if fee > 0 then perform public.kc_pay(c.team_id, -fee, 'Extension fee: ' || public.kc_pname(c.player_id)); end if;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status, locked_until, provisional, clause_kt)
  values (c.player_id, c.team_id, base, sal, c.end_season + 1, c.end_season + p_years, new_tier, false, c.home_grown, 'extension', 'pending',
          case when setup then null else now() + interval '12 months' end, setup,
          case when new_tier = 'none' then null else public.kc_clause_at(c.player_id, new_tier, c.league_id) end);
  if not setup then update kc_contracts set locked_until = now() + interval '12 months' where id = c.id; end if;
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'extension', fee, 0, p_years || ' more yrs at $' || sal || 'k from ' || (c.end_season + 1) || case when fee > 0 then ' (' || fee || ' KT fee)' else '' end);
  return sal;
end $$;

-- Releases: no KT fee during setup (dead money still applies to a locked contract).
create or replace function public.kc_release(cid bigint) returns integer language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; yrs int; dead int; later int; fee int; y int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can release him'; end if;
  if c.provisional and public.kc_in_setup() then raise exception 'That contract is provisional. Undo it instead (free)'; end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s agreed to join another club at season end'; end if;
  if exists (select 1 from kc_claims where contract_id = c.id and status = 'pending') then raise exception 'His clause has been paid. Match it or let him go first'; end if;
  if exists (select 1 from kc_auctions where contract_id = c.id and status = 'open') then raise exception 'He''s up for auction. Cancel that first'; end if;
  yrs := greatest(1, c.end_season - greatest(c.start_season, k.season) + 1);
  dead := round(c.salary_k * 0.5);
  later := round(c.salary_k * 0.2);
  fee := case when public.kc_in_setup() then 0 else round(c.salary_k * yrs * k.release_fee_pct / 100.0 * k.fee_kt_per_k) end;
  if fee > 0 and public.kc_bank(c.team_id) < fee then raise exception 'Releasing him costs % KT. You have %', fee, public.kc_bank(c.team_id); end if;
  update kc_contracts set status = 'released', dead_k = dead, dead_season = k.season, updated_at = now() where id = c.id;
  if later > 0 then
    for y in k.season + 1 .. c.end_season loop
      insert into kc_dead (team_id, player_id, contract_id, season, amount_k) values (c.team_id, c.player_id, c.id, y, later);
    end loop;
  end if;
  if fee > 0 then perform public.kc_pay(c.team_id, -fee, 'Release fee: ' || public.kc_pname(c.player_id)); end if;
  update kc_contracts set status = 'voided', updated_at = now()
   where player_id = c.player_id and status = 'pending' and team_id = c.team_id and league_id = public.current_league();
  update kc_free_agents set kind = 'open', closes_at = case when k.window_open then k.window_closes_at else null end
   where player_id = c.player_id and status = 'open' and kind = 'pending' and league_id = public.current_league();
  insert into kc_free_agents (player_id, ex_team, closes_at) values (c.player_id, c.team_id, case when k.window_open then k.window_closes_at else null end)
    on conflict do nothing;
  perform public.kc_log(c.player_id, c.team_id, null, 'release', fee, 0, '$' || dead || 'k dead money' || case when yrs > 1 then ', then $' || later || 'k a year to ' || c.end_season else '' end || case when fee > 0 then ', ' || fee || ' KT fee' else '' end);
  return dead;
end $$;

-- Term deposits: 6, 12 or 24 months.
drop function if exists public.kc_deposit(integer);
create or replace function public.kc_deposit(amount integer, p_months integer default 12) returns bigint language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); did bigint; r int := public.kc_deposit_rate(p_months);
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if r is null then raise exception 'Pick 6 months, 1 year or 2 years'; end if;
  if amount < 10 then raise exception 'The minimum deposit is 10 KT'; end if;
  if public.kc_bank(me) < amount then raise exception 'You have % KT', public.kc_bank(me); end if;
  perform public.kc_pay(me, -amount, 'Term deposit (' || case p_months when 6 then '6 months' when 12 then '1 year' else '2 years' end || ', +' || r || '%)');
  insert into kc_deposits (team_id, amount, rate_pct, season, term_months, matures_at)
  values (me, amount, r, k.season + case when p_months = 24 then 1 else 0 end, p_months, now() + make_interval(months => p_months)) returning id into did;
  return did;
end $$;

-- Collect matured deposits (yours; the commish can collect for everyone).
create or replace function public.kc_collect_deposits() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; total int := 0;
begin
  for r in select * from kc_deposits where status = 'open' and matures_at <= now() and league_id = public.current_league()
             and (team_id = public.my_team_id() or public.is_commish()) for update loop
    perform public.kc_pay(r.team_id, r.amount + r.amount * r.rate_pct / 100, 'Term deposit matured (+' || r.rate_pct || '%)');
    update kc_deposits set status = 'paid' where id = r.id;
    n := n + 1; total := total + r.amount + r.amount * r.rate_pct / 100;
  end loop;
  return total;
end $$;

-- Rollover pays only deposits that have matured.
create or replace function public.kc_rollover() returns integer language plpgsql security definer set search_path = public as $$
declare k kc_settings; r record; n int := 0; bad text := ''; allow int;
begin
  if not public.is_commish() then raise exception 'Only the commish can roll the season over'; end if;
  select * into k from kc_settings where league_id = public.current_league() for update;
  if k.window_open then raise exception 'Close the window first'; end if;
  for r in select id, name from teams where league_id = public.current_league() and not coalesce(is_guest, false) loop
    allow := k.deficit_max_k;
    if exists (select 1 from kc_cap_adjust where team_id = r.id and season = k.season + 1 and league_id = public.current_league()) then allow := 0; end if;
    if public.kc_kept_count(r.id, k.season + 1) > 18
       or public.kc_salary(r.id, k.season + 1) > public.kc_keeper_cap(r.id, k.season + 1) + allow then
      bad := bad || r.name || ', ';
    end if;
  end loop;
  if bad <> '' then raise exception 'These clubs are over the keeper cap or keeper limit: %', left(bad, length(bad) - 2); end if;
  for r in select id from teams where league_id = public.current_league() and not coalesce(is_guest, false) loop
    if public.kc_salary(r.id, k.season + 1) > public.kc_keeper_cap(r.id, k.season + 1) then perform public.kc_lockin(r.id); end if;
  end loop;
  for r in select * from kc_contracts where status = 'active' and end_season <= k.season and league_id = public.current_league() loop
    update kc_contracts set status = 'expired', updated_at = now() where id = r.id;
    if not exists (select 1 from kc_contracts where player_id = r.player_id and status = 'pending' and league_id = public.current_league()) then
      insert into kc_free_agents (player_id, ex_team) values (r.player_id, r.team_id) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  for r in select * from kc_deposits where status = 'open' and coalesce(matures_at <= now(), season <= k.season) and league_id = public.current_league() loop
    perform public.kc_pay(r.team_id, r.amount + r.amount * r.rate_pct / 100, 'Term deposit matured (+' || r.rate_pct || '%)');
    update kc_deposits set status = 'paid' where id = r.id;
  end loop;
  for r in select * from kc_loans where status = 'active' and season <= k.season and league_id = public.current_league() loop
    perform public.kc_pay(r.borrower, -(r.amount + r.amount * r.rate_pct / 100), 'Loan repaid to ' || (select short_code from teams where id = r.lender));
    perform public.kc_pay(r.lender, r.amount + r.amount * r.rate_pct / 100, 'Loan repaid by ' || (select short_code from teams where id = r.borrower));
    update kc_loans set status = 'repaid' where id = r.id;
  end loop;
  update kc_loans set status = 'cancelled' where status = 'offered' and league_id = public.current_league();
  update kc_free_agents set kind = 'open', closes_at = null where status = 'open' and kind = 'pending' and league_id = public.current_league();
  update kc_contracts set status = 'active', updated_at = now() where status = 'pending' and start_season <= k.season + 1 and league_id = public.current_league();
  update kc_settings set season = k.season + 1, midseason_at = null, updated_at = now() where league_id = public.current_league();
  insert into kc_ledger (team_id, delta, reason)
  select id, k.start_kt, (k.season + 1) || ' starting bank' from teams where league_id = public.current_league() and not coalesce(is_guest, false);
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, 'Rolled over to ' || (k.season + 1) || ': ' || n || ' free agents');
  return n;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('kc_in_setup', 'kc_fresh_start', 'kc_sign_own', 'kc_undo_contract', 'kc_lock_contracts', 'kc_set_tier',
                                                        'kc_extend', 'kc_release', 'kc_deposit', 'kc_collect_deposits', 'kc_rollover')
  loop execute format('alter function %s owner to khq_definer', r.sig); end loop;
end $$;
revoke create on schema public from khq_definer;
grant execute on function public.kc_undo_contract(bigint), public.kc_lock_contracts(bigint, int), public.kc_deposit(int, int),
  public.kc_collect_deposits(), public.kc_fresh_start() to authenticated;

-- Run the fresh start for this league now (with backups).
create table if not exists public.kc_contracts_backup_fresh_20261116 as select * from public.kc_contracts;
create table if not exists public.kc_ledger_backup_fresh_20261116 as select * from public.kc_ledger;
alter table public.kc_contracts_backup_fresh_20261116 enable row level security;
alter table public.kc_ledger_backup_fresh_20261116 enable row level security;
delete from public.kc_dead; delete from public.kc_bids; delete from public.kc_auctions; delete from public.kc_claims; delete from public.kc_offers;
delete from public.kc_free_agents; delete from public.kc_cap_adjust; delete from public.kc_deposits; delete from public.kc_loans; delete from public.kc_contracts;
delete from public.kc_ledger;
insert into public.kc_ledger (league_id, team_id, delta, reason)
select t.league_id, t.id, k.start_kt, k.season || ' starting bank' from public.teams t join public.kc_settings k on k.league_id = t.league_id where not coalesce(t.is_guest, false);
insert into public.kc_transfers (league_id, player_id, from_team, to_team, kind, fee_kt, levy_kt, note)
select league_id, null, null, null, 'seed', 0, 0, 'Fresh start: every player is unsigned. Re-sign your list before deadline day.' from public.kc_settings;
