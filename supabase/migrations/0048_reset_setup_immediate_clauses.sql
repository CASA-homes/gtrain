-- Year-1 reset and rules:
--  • Market value: flatter at the top (anything above $90k counts at 90%).
--  • Every starting contract is home-grown (20% off). Contracts reset to the start: extensions/signings since launch removed,
--    clauses back to standard, dead money/offers/deposits/loans cleared, banks back to 1,000 KT.
--  • Setup period: until deadline day each coach can change the clause on their own contracts.
--  • Keeper cap applies to the coming season (k.season) on deadline day.
--  • Clause buys in a window: the player moves to the buyer straight away; the buyer names a player to drop.

-- 1. Value curve
create or replace function public.kc_rate_v2(p_hist jsonb, p_age int, p_live int) returns int language plpgsql immutable as $$
declare n int; s0 int; g0 numeric := 0; a0 numeric := 0; g1 numeric; a1 numeric; g2 numeric; a2 numeric; prior numeric; w0 numeric; w1 numeric := 0; w2 numeric := 0;
        avg numeric; xp numeric; agef numeric; avail numeric; v numeric;
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
  v := power(greatest(coalesce(avg, 0) - 55, 0), 1.3) * 0.66 * xp * agef * avail;
  if v > 90 then v := 90 + (v - 90) * 0.9; end if;
  return greatest(5, round(v))::int;
end $$;

-- 2. Settings
alter table public.kc_settings add column if not exists setup_until timestamptz;
update public.kc_settings set home_grown_pct = 20, setup_until = '2027-02-17 23:59:59+08';

-- 3. Reset (with backups)
create table if not exists public.kc_contracts_backup_reset_20261116 as select * from public.kc_contracts;
create table if not exists public.kc_ledger_backup_reset_20261116 as select * from public.kc_ledger;
alter table public.kc_contracts_backup_reset_20261116 enable row level security;
alter table public.kc_ledger_backup_reset_20261116 enable row level security;

delete from public.kc_dead;
delete from public.kc_bids;
delete from public.kc_auctions;
delete from public.kc_claims;
delete from public.kc_offers;
delete from public.kc_free_agents;
delete from public.kc_cap_adjust;
delete from public.kc_deposits;
delete from public.kc_loans;
delete from public.kc_contracts where how not in ('seed', 'rookie', 'draft');
update public.kc_contracts set status = 'active', dead_k = 0, dead_season = null, locked_until = null, home_grown = true,
       tier = case when tier = 'protected' then 'protected' else 'standard' end, updated_at = now();
update public.kc_contracts c set base_k = greatest(5, round(public.kc_rate(c.player_id) * (100 - k.home_grown_pct) / 100.0))::int
  from public.kc_settings k where k.league_id = c.league_id;
update public.kc_contracts c set salary_k = round(c.base_k * (1 + case c.tier when 'high' then k.high_pct when 'none' then k.none_pct else 0 end / 100.0))::int,
       clause_kt = public.kc_clause_at(c.player_id, c.tier, c.league_id)
  from public.kc_settings k where k.league_id = c.league_id;

delete from public.kc_ledger;
insert into public.kc_ledger (league_id, team_id, delta, reason)
select t.league_id, t.id, k.start_kt, k.season || ' starting bank' from public.teams t join public.kc_settings k on k.league_id = t.league_id where not coalesce(t.is_guest, false);
insert into public.kc_transfers (league_id, player_id, from_team, to_team, kind, fee_kt, levy_kt, note)
select league_id, null, null, null, 'seed', 0, 0, 'Contracts reset to the start. Set your clauses before deadline day.' from public.kc_settings;

-- 4. Setup period: coaches set clauses on their own contracts until deadline day
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
  update kc_contracts set tier = new_tier, salary_k = round(base_k * (1 + case new_tier when 'high' then k.high_pct when 'none' then k.none_pct else 0 end / 100.0))::int, updated_at = now() where id = cid;
end $$;

-- 5. Deadline day: keeper cap and 17 + 1 limit apply to the coming season
create or replace function public.kc_lockin(t int) returns text language plpgsql security definer set search_path = public as $$
declare k kc_settings; s int; sal int; cap int; over int; kept int;
begin
  if t is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only the club can lock in its keepers'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  s := k.season;
  kept := public.kc_kept_count(t, s);
  if kept > 18 then raise exception 'You''re keeping % players. The most is 17 + 1 rookie', kept; end if;
  sal := public.kc_salary(t, s); cap := public.kc_keeper_cap(t, s); over := sal - cap;
  if over <= 0 then return 'ok'; end if;
  if over > k.deficit_max_k then raise exception '$%k over the keeper cap. The most you can carry is $%k: release, trade or sell a player, or the commish will release one', over, k.deficit_max_k; end if;
  if exists (select 1 from kc_cap_adjust where team_id = t and season = s and league_id = public.current_league()) then
    raise exception 'You ran a deficit last year, so you can''t run one again';
  end if;
  perform public.kc_pay(t, -k.deficit_fee_kt, 'Deficit fee: $' || over || 'k over for ' || s);
  insert into kc_cap_adjust (team_id, season, amount_k, reason) values (t, s + 1, over, s || ' deficit')
    on conflict (league_id, team_id, season) do update set amount_k = excluded.amount_k;
  perform public.kc_log(null::int, t, t, 'deficit', k.deficit_fee_kt, 0, '$' || over || 'k deficit for ' || s || ' (' || k.deficit_fee_kt || ' KT fee): ' || (s + 1) || ' keeper cap drops by that');
  return 'deficit';
end $$;

-- 6. Immediate clause moves with a player dropped
alter table public.kc_claims add column if not exists drop_player int;
drop function if exists public.kc_buy(bigint);
create or replace function public.kc_buy(cid bigint, p_drop int) returns bigint language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; me int := public.my_team_id(); price int; buys int; claim bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if not k.window_open or k.window_closes_at < now() then raise exception 'Release clauses can only be paid while a window is open'; end if;
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id = me then raise exception 'He''s already yours'; end if;
  if exists (select 1 from kc_claims where contract_id = c.id and status = 'pending') then raise exception 'Someone has already paid his clause'; end if;
  if p_drop is null or not exists (select 1 from squad where player_id = p_drop and team_id = me and league_id = public.current_league()) then
    raise exception 'Pick a player from your list to drop';
  end if;
  price := public.kc_clause(c.id);
  if price is null then raise exception 'He has no release clause'; end if;
  select count(*) into buys from kc_claims where buyer_team = me and status <> 'cancelled' and created_at >= k.window_opened_at and league_id = public.current_league();
  if buys >= k.max_buys then raise exception 'You''ve used your % clause buys this window', k.max_buys; end if;
  if public.kc_bank(me) < price then raise exception 'You need % KT and have %', price, public.kc_bank(me); end if;
  if public.kc_salary(me, k.season) + c.salary_k > k.season_cap_k then
    raise exception 'His $%k salary would take you over the $%k cap', c.salary_k, k.season_cap_k;
  end if;
  perform public.kc_pay(me, -price, 'Clause paid (held 24h): ' || public.kc_pname(c.player_id));
  insert into kc_claims (contract_id, player_id, buyer_team, seller_team, price_kt, season, expires_at, drop_player)
  values (c.id, c.player_id, me, c.team_id, price, k.season, now() + interval '24 hours', p_drop) returning id into claim;
  return claim;
end $$;

create or replace function public.kc_complete_claim(claim_id bigint) returns text language plpgsql security definer set search_path = public as $$
declare cl kc_claims; c kc_contracts; k kc_settings; levy int; dc kc_contracts;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into cl from kc_claims where id = claim_id and status = 'pending' and league_id = public.current_league() for update;
  if cl is null then raise exception 'That clause isn''t pending'; end if;
  if cl.expires_at > now() and cl.seller_team is distinct from public.my_team_id() and not public.is_commish() then
    raise exception 'His club has until the 24 hours are up to match';
  end if;
  select * into c from kc_contracts where id = cl.contract_id and status = 'active' for update;
  if c is null or c.team_id <> cl.seller_team
     or not exists (select 1 from squad where player_id = cl.drop_player and team_id = cl.buyer_team) then
    perform public.kc_pay(cl.buyer_team, cl.price_kt, 'Clause refunded: ' || public.kc_pname(cl.player_id));
    update kc_claims set status = 'cancelled' where id = cl.id;
    return 'cancelled';
  end if;
  levy := cl.price_kt * k.levy_pct / 100;
  perform public.kc_pay(cl.seller_team, cl.price_kt - levy, 'Sold on release clause: ' || public.kc_pname(cl.player_id));
  -- Buyer drops a player: release his contract (usual costs) if he has one, and take him off the list.
  select * into dc from kc_contracts where player_id = cl.drop_player and team_id = cl.buyer_team and status = 'active' limit 1;
  if dc.id is not null then
    update kc_contracts set status = 'released', dead_k = round(dc.salary_k * 0.5), dead_season = k.season, updated_at = now() where id = dc.id;
    if dc.end_season > k.season then
      insert into kc_dead (team_id, player_id, contract_id, season, amount_k)
      select cl.buyer_team, dc.player_id, dc.id, y, round(dc.salary_k * 0.2) from generate_series(k.season + 1, dc.end_season) y;
    end if;
    update kc_contracts set status = 'voided' where player_id = dc.player_id and status = 'pending' and team_id = cl.buyer_team;
  end if;
  delete from squad where player_id = cl.drop_player and team_id = cl.buyer_team;
  insert into kc_free_agents (player_id, ex_team) values (cl.drop_player, cl.buyer_team) on conflict do nothing;
  -- He moves now on the rest of his contract.
  update kc_contracts set team_id = cl.buyer_team, how = 'clause', home_grown = false, locked_until = null, updated_at = now()
   where player_id = c.player_id and status in ('active', 'pending') and team_id = cl.seller_team;
  update squad set team_id = cl.buyer_team, is_keeper = false, is_rookie_keeper = false, lineup = null,
         acquired_how = 'Release clause', acquired_season = k.season, updated_at = now()
   where player_id = c.player_id;
  update kc_auctions set status = 'cancelled' where contract_id = c.id and status = 'open';
  update kc_claims set status = 'completed' where id = cl.id;
  perform public.kc_log(cl.player_id, cl.seller_team, cl.buyer_team, 'clause', cl.price_kt, levy, 'Moved now; ' || public.kc_pname(cl.drop_player) || ' dropped');
  return 'completed';
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
