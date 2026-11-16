-- KT rescale: 1 KT = $10 for clauses (×100 on clauses), banks ×5 (start 1,000 KT), fees and other balances ×5.
-- Plus: rivals can offer contracts to out-of-contract players on other lists in the off-season (owner reviews).
create table if not exists public.kc_ledger_backup_b_20261116 as select * from public.kc_ledger;
alter table public.kc_ledger_backup_b_20261116 enable row level security;
alter table public.kc_settings add column if not exists fee_kt_per_k int not null default 5 check (fee_kt_per_k between 0 and 1000);
update public.kc_settings set kt_per_k = 100, start_kt = 1000, deficit_fee_kt = 250, ext_fee_kt = 50, fee_kt_per_k = 5;

update public.kc_ledger set delta = delta * 5;
update public.kc_deposits set amount = amount * 5;
update public.kc_loans set amount = amount * 5;
update public.kc_offers set sweet_kt = sweet_kt * 5;
update public.kc_claims set price_kt = price_kt * 5;
update public.kc_auctions set reserve_kt = reserve_kt * 5, price_kt = price_kt * 5;
update public.kc_bids set amount_kt = amount_kt * 5;
update public.desk_items set kt = kt * 5 where kt is not null;
update public.kc_transfers set fee_kt = fee_kt * 5, levy_kt = levy_kt * 5;
update public.kc_contracts set clause_kt = public.kc_clause_at(player_id, tier, league_id) where status in ('active', 'pending');

-- Sweeteners count against salary at the fee rate (5 KT = $1k).
create or replace function public.kc_offer_score(years int, salary_k int, sweet_kt int, pick_ids int[]) returns int language sql stable security definer set search_path = public as $$
  select (years * salary_k + coalesce(sweet_kt, 0) / 5
    + coalesce((select sum(round(3000 * exp(-0.07 * (coalesce(overall, (round - 1) * 10 + 5) - 1)) / 50)) from picks where id = any(pick_ids)), 0))::int
$$;

create or replace function public.kc_deposit(amount int) returns bigint language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); did bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if amount < 10 then raise exception 'The minimum deposit is 10 KT'; end if;
  if public.kc_bank(me) < amount then raise exception 'You have % KT', public.kc_bank(me); end if;
  perform public.kc_pay(me, -amount, 'Term deposit (locked to season end)');
  insert into kc_deposits (team_id, amount, rate_pct, season) values (me, amount, k.deposit_pct, k.season) returning id into did;
  return did;
end $$;

create or replace function public.kc_loan_offer(p_borrower int, amount int, p_rate int) returns bigint language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); lid bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if p_borrower = me then raise exception 'You can’t lend to yourself'; end if;
  if amount < 10 then raise exception 'The minimum loan is 10 KT'; end if;
  if p_rate < 0 or p_rate > k.loan_max_pct then raise exception 'Interest must be 0 to % percent', k.loan_max_pct; end if;
  if public.kc_bank(me) < amount then raise exception 'You have % KT', public.kc_bank(me); end if;
  insert into kc_loans (lender, borrower, amount, rate_pct, season) values (me, p_borrower, amount, p_rate, k.season) returning id into lid;
  return lid;
end $$;

create or replace function public.kc_release(cid bigint) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; yrs int; dead int; later int; fee int; y int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can release him'; end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s agreed to join another club at season end'; end if;
  if exists (select 1 from kc_claims where contract_id = c.id and status = 'pending') then raise exception 'His clause has been paid. Match it or let him go first'; end if;
  if exists (select 1 from kc_auctions where contract_id = c.id and status = 'open') then raise exception 'He''s up for auction. Cancel that first'; end if;
  yrs := greatest(1, c.end_season - greatest(c.start_season, k.season) + 1);
  dead := round(c.salary_k * 0.5);
  later := round(c.salary_k * 0.2);
  fee := round(c.salary_k * yrs * k.release_fee_pct / 100.0 * k.fee_kt_per_k);
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

alter table public.kc_free_agents drop constraint if exists kc_free_agents_kind_check;
alter table public.kc_free_agents add constraint kc_free_agents_kind_check check (kind in ('open', 'pending', 'offseason'));

-- A rival opens offers on an out-of-contract player on another list. Returns the free-agent id to offer on.
create or replace function public.kc_open_unsigned(pid int) returns bigint language plpgsql security definer set search_path = public as $$
declare me int := public.my_team_id(); t int; fid bigint;
begin
  if me is null then raise exception 'Sign in as a coach'; end if;
  select team_id into t from squad where player_id = pid and league_id = public.current_league();
  if t is null then raise exception 'He isn''t on a list'; end if;
  if t = me then raise exception 'He''s yours. Offer him a contract from your Contracts tab'; end if;
  if exists (select 1 from kc_contracts where player_id = pid and status in ('active', 'pending') and league_id = public.current_league()) then
    raise exception 'He''s under contract';
  end if;
  select id into fid from kc_free_agents where player_id = pid and status = 'open' and league_id = public.current_league();
  if fid is not null then return fid; end if;
  insert into kc_free_agents (player_id, ex_team, kind) values (pid, t, 'offseason') returning id into fid;
  return fid;
end $$;

create or replace function public.kc_accept_offer(oid bigint) returns text language plpgsql security definer set search_path = public as $$
declare o kc_offers; f kc_free_agents; k kc_settings; r record; base int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into o from kc_offers where id = oid and status = 'tabled' and league_id = public.current_league() for update;
  if o is null then raise exception 'That offer isn''t open'; end if;
  select * into f from kc_free_agents where id = o.fa_id and status = 'open' and kind in ('pending', 'offseason') for update;
  if f is null then raise exception 'He''s not taking offers'; end if;
  if f.ex_team is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can accept'; end if;
  for r in select * from kc_offers where fa_id = f.id and status = 'tabled' and id <> o.id loop
    perform public.kc_pay(r.team_id, r.sweet_kt, 'Offer refunded: ' || public.kc_pname(f.player_id));
    update kc_offers set status = 'lost', updated_at = now() where id = r.id;
  end loop;
  update kc_offers set status = 'won', updated_at = now() where id = o.id;
  perform public.kc_pay(f.ex_team, o.sweet_kt, 'Transfer fee: ' || public.kc_pname(f.player_id));
  base := o.salary_k;
  if f.kind = 'offseason' then
    -- Out of contract in the off-season: he's the new club's from the start of the coming season.
    insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how, status)
    values (f.player_id, o.team_id, base, round(base * public.kc_premium(o.tier))::int, k.season, k.season + o.years - 1, o.tier, 'free_agent', 'active');
  else
    insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how, status)
    values (f.player_id, o.team_id, base, round(base * public.kc_premium(o.tier))::int, k.season + 1, k.season + o.years, o.tier, 'free_agent', 'pending');
  end if;
  update kc_free_agents set status = 'signed', signed_team = o.team_id where id = f.id;
  perform public.kc_log(f.player_id, f.ex_team, o.team_id, 'free_agent', o.sweet_kt, 0,
    'Agreed: moves at season end, ' || o.years || ' yrs at $' || round(base * public.kc_premium(o.tier)) || 'k'
    || case when array_length(o.pick_ids, 1) > 0 then ' + picks (noted only)' else '' end);
  return 'accepted';
end $$;

create or replace function public.kc_sign_own(pid int, p_years int, new_tier text) returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); t int; base int; sal int; r record;
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
  -- Any rival offers on him are refunded and closed.
  for r in select o.* from kc_offers o join kc_free_agents f on f.id = o.fa_id where f.player_id = pid and f.status = 'open' and f.kind = 'offseason' and o.status = 'tabled' and f.league_id = public.current_league() loop
    perform public.kc_pay(r.team_id, r.sweet_kt, 'Offer refunded: ' || public.kc_pname(pid));
    update kc_offers set status = 'lost', updated_at = now() where id = r.id;
  end loop;
  update kc_free_agents set status = 'signed', signed_team = t where player_id = pid and status = 'open' and kind = 'offseason' and league_id = public.current_league();
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status)
  values (pid, t, base, sal, k.season, k.season + p_years - 1, new_tier, false, false, 'free_agent', 'active');
  perform public.kc_log(pid, t, t, 'free_agent', 0, 0, p_years || ' yrs at $' || sal || 'k from ' || k.season);
  return sal;
end $$;

create or replace function public.kc_offer(faid bigint, p_years int, p_salary int, new_tier text, sweet int, picks_in int[]) returns int language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; k kc_settings; me int := public.my_team_id(); minimum int; old kc_offers; sc int; check_season int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  select * into f from kc_free_agents where id = faid and status = 'open' and league_id = public.current_league();
  if f is null then raise exception 'He''s no longer a free agent'; end if;
  if f.ex_team = me and f.kind in ('pending', 'offseason') then raise exception 'He''s yours. You can''t bid on your own player'; end if;
  if f.closes_at is not null and f.closes_at < now() then raise exception 'Offers for him have closed'; end if;
  if p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  minimum := greatest(5, public.kc_rate(f.player_id));
  if p_salary < minimum then raise exception 'The minimum is his market value: $%k a year', minimum; end if;
  if sweet < 0 then raise exception 'The fee can''t be negative'; end if;
  if exists (select 1 from unnest(coalesce(picks_in, '{}')) pid where not exists (select 1 from picks where id = pid and owner_team_id = me)) then
    raise exception 'You can only offer picks you own';
  end if;
  check_season := k.season;
  if f.kind = 'pending' then check_season := k.season + 1; end if;
  if public.kc_salary(me, check_season) + round(p_salary * public.kc_premium(new_tier)) > k.season_cap_k then
    raise exception 'That salary would take you over the $%k season cap in %', k.season_cap_k, check_season;
  end if;
  sc := public.kc_offer_score(p_years, p_salary, sweet, coalesce(picks_in, '{}'));
  select * into old from kc_offers where fa_id = faid and team_id = me for update;
  if old.id is not null then
    if old.status <> 'tabled' then raise exception 'That offer has already been decided'; end if;
    if sc < old.score then raise exception 'A tabled offer can only go up (yours scores %)', old.score; end if;
    if public.kc_bank(me) < sweet - old.sweet_kt then raise exception 'Not enough tokens'; end if;
    perform public.kc_pay(me, -(sweet - old.sweet_kt), 'Offer held: ' || public.kc_pname(f.player_id));
    update kc_offers set years = p_years, salary_k = p_salary, tier = new_tier, sweet_kt = sweet, pick_ids = coalesce(picks_in, '{}'), score = sc, updated_at = now() where id = old.id;
  else
    if public.kc_bank(me) < sweet then raise exception 'Not enough tokens'; end if;
    perform public.kc_pay(me, -sweet, 'Offer held: ' || public.kc_pname(f.player_id));
    insert into kc_offers (fa_id, player_id, team_id, years, salary_k, tier, sweet_kt, pick_ids, score)
    values (faid, f.player_id, me, p_years, p_salary, new_tier, sweet, coalesce(picks_in, '{}'), sc);
  end if;
  return sc;
end $$;

grant create on schema public to khq_definer;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and p.proname like 'kc\_%' loop
    execute format('alter function %s owner to khq_definer', f.sig);
  end loop;
end $$;
revoke create on schema public from khq_definer;
revoke execute on function public.kc_contract_clause_trg() from public, anon, authenticated;
