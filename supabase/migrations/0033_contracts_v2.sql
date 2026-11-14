-- Contracts v2 (shadow season): cap deficit at lock-in, matching a release clause, pending free agency from
-- mid-season, draftee season deals, clauses and auctions that move players at season end, no limit on long deals.

-- 1. Settings and new tables -----------------------------------------------------------------------------------------
alter table public.kc_settings add column if not exists deficit_max_k int not null default 50 check (deficit_max_k between 0 and 1000);
alter table public.kc_settings add column if not exists hold_back_k  int not null default 12 check (hold_back_k between 0 and 200);
alter table public.kc_settings add column if not exists midseason_at timestamptz;
update public.kc_settings set long_deal_limit = 33;   -- no limit on long deals

alter table public.kc_free_agents add column if not exists kind text not null default 'open' check (kind in ('open', 'pending'));

alter table public.kc_transfers drop constraint if exists kc_transfers_kind_check;
alter table public.kc_transfers add constraint kc_transfers_kind_check
  check (kind in ('clause', 'auction', 'free_agent', 'release', 'extension', 'tier', 'seed', 'match', 'deficit', 'draft', 'pending'));

-- Keeper-cap adjustments: a deficit taken at lock-in comes off a later season's keeper cap.
create table if not exists public.kc_cap_adjust (
  id         bigint generated always as identity primary key,
  league_id  int not null default public.current_league() references public.leagues(id) on delete cascade,
  team_id    int not null references public.teams(id) on delete cascade,
  season     int not null,          -- the season whose keeper cap is reduced
  amount_k   int not null check (amount_k > 0),
  reason     text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists kc_cap_adjust_one on public.kc_cap_adjust (league_id, team_id, season);

-- A paid release clause waits 24 hours for the owner to match it.
create table if not exists public.kc_claims (
  id          bigint generated always as identity primary key,
  league_id   int not null default public.current_league() references public.leagues(id) on delete cascade,
  contract_id bigint not null references public.kc_contracts(id) on delete cascade,
  player_id   int not null,
  buyer_team  int not null references public.teams(id) on delete cascade,
  seller_team int not null references public.teams(id) on delete cascade,
  price_kt    int not null,
  season      int not null,
  expires_at  timestamptz not null,
  status      text not null default 'pending' check (status in ('pending', 'matched', 'completed', 'cancelled')),
  created_at  timestamptz not null default now()
);
create unique index if not exists kc_claims_one_pending on public.kc_claims (league_id, contract_id) where status = 'pending';

do $$
declare t text;
begin
  foreach t in array array['kc_cap_adjust', 'kc_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "league scope" on public.%I', t);
    execute format('create policy "league scope" on public.%I as restrictive for all using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()))', t);
    execute format('drop policy if exists "definer access" on public.%I', t);
    execute format('create policy "definer access" on public.%I for all to khq_definer using (true) with check (true)', t);
    execute format('drop policy if exists "%s: members read" on public.%I', t, t);
    execute format('create policy "%s: members read" on public.%I for select using ((select public.is_member()))', t, t);
  end loop;
end $$;

-- A club sees the offers on its own pending free agents (it's choosing between them). Still blind to other bidders.
drop policy if exists "kc_offers: own club or commish" on public.kc_offers;
create policy "kc_offers: own club or commish" on public.kc_offers for select
  using (team_id = (select public.my_team_id()) or (select public.is_commish())
         or exists (select 1 from public.kc_free_agents f where f.id = fa_id and f.kind = 'pending' and f.ex_team = (select public.my_team_id())));

-- 2. Helpers ---------------------------------------------------------------------------------------------------------
-- A club's keeper cap for a season, after any deficit taken the year before.
create or replace function public.kc_keeper_cap(t int, s int) returns int language sql stable security definer set search_path = public as $$
  select (select keeper_cap_k from kc_settings where league_id = public.current_league())
       - coalesce((select sum(amount_k) from kc_cap_adjust where team_id = t and season = s and league_id = public.current_league()), 0)::int
$$;

-- Contracts that carry into a season (the keepers for it).
create or replace function public.kc_kept_count(t int, s int) returns int language sql stable security definer set search_path = public as $$
  select count(distinct player_id)::int from kc_contracts
   where team_id = t and status in ('active', 'pending') and start_season <= s and end_season >= s and league_id = public.current_league()
$$;

-- Is this player a pending free agent right now?
create or replace function public.kc_is_pending(pid int) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kc_free_agents where player_id = pid and status = 'open' and kind = 'pending' and league_id = public.current_league())
$$;

-- Clause: only on a player with seasons left after this one. Final-year players (draftees included) have no clause:
-- they're extended, or become pending free agents at mid-season and their club picks an offer.
create or replace function public.kc_clause(cid bigint) returns int language sql stable security definer set search_path = public as $$
  select case when c.tier in ('none', 'protected') or c.end_season <= k.season or public.kc_is_pending(c.player_id) then null
    else (public.kc_rate(c.player_id) * case when c.tier = 'high' then k.clause_high else k.clause_std end * k.kt_per_k)::int end
    from kc_contracts c join kc_settings k on k.league_id = c.league_id
   where c.id = cid and c.league_id = public.current_league()
$$;

-- Has he already agreed to join another club at season end (clause or pending free agency)?
create or replace function public.kc_moving(pid int, t int) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kc_contracts where player_id = pid and status = 'pending' and team_id <> t and league_id = public.current_league())
$$;

-- 3. Extend: not once a player has become a pending free agent ---------------------------------------------------------
create or replace function public.kc_extend(cid bigint, p_years int, new_tier text) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; base int; sal int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can extend him'; end if;
  if c.end_season > k.season then raise exception 'You can only extend a player in his final year'; end if;
  if public.kc_is_pending(c.player_id) then raise exception 'He''s a pending free agent now. Take an offer, or he goes to free agency at season end'; end if;
  if exists (select 1 from kc_contracts where player_id = c.player_id and status = 'pending' and league_id = public.current_league()) then
    raise exception 'He''s already signed for next season';
  end if;
  if p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  base := greatest(5, round(public.kc_rate(c.player_id) * public.kc_length_factor(p_years) * case when c.home_grown then (100 - k.home_grown_pct) / 100.0 else 1 end))::int;
  sal := round(base * public.kc_premium(new_tier))::int;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status)
  values (c.player_id, c.team_id, base, sal, k.season + 1, k.season + p_years, new_tier, false, c.home_grown, 'extension', 'pending');
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'extension', 0, 0, p_years || ' yrs at $' || sal || 'k from ' || (k.season + 1));
  return sal;
end $$;

-- 4. Release clauses: mid-season window only. Pay → his club has 24h to match → if not, he joins you at season end
-- on the rest of his contract. He finishes this season with his club.
drop function if exists public.kc_buy(bigint);
create or replace function public.kc_buy(cid bigint) returns bigint language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; me int := public.my_team_id(); price int; buys int; claim bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if not k.window_open or k.window_closes_at < now() then raise exception 'Release clauses can only be paid in the mid-season window'; end if;
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id = me then raise exception 'He''s already yours'; end if;
  if exists (select 1 from kc_claims where contract_id = c.id and status = 'pending') then raise exception 'Someone has already paid his clause'; end if;
  price := public.kc_clause(c.id);
  if price is null then raise exception 'He has no release clause'; end if;
  select count(*) into buys from kc_claims where buyer_team = me and status <> 'cancelled' and created_at >= k.window_opened_at and league_id = public.current_league();
  if buys >= k.max_buys then raise exception 'You''ve used your % clause buys this window', k.max_buys; end if;
  if public.kc_bank(me) < price then raise exception 'You need % KT and have %', price, public.kc_bank(me); end if;
  if public.kc_salary(me, k.season + 1) + c.salary_k > k.season_cap_k then
    raise exception 'His $%k salary would take you over the $%k cap next season', c.salary_k, k.season_cap_k;
  end if;
  perform public.kc_pay(me, -price, 'Clause paid (held 24h): ' || public.kc_pname(c.player_id));
  insert into kc_claims (contract_id, player_id, buyer_team, seller_team, price_kt, season, expires_at)
  values (c.id, c.player_id, me, c.team_id, price, k.season, now() + interval '24 hours') returning id into claim;
  return claim;
end $$;

-- His club matches: pays the clause (burned), buyer refunded, clause steps up a level (salary with it). Once a season.
create or replace function public.kc_match(claim_id bigint) returns text language plpgsql security definer set search_path = public as $$
declare cl kc_claims; c kc_contracts; new_tier text;
begin
  select * into cl from kc_claims where id = claim_id and status = 'pending' and league_id = public.current_league() for update;
  if cl is null then raise exception 'That clause isn''t waiting on you'; end if;
  if cl.seller_team is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can match'; end if;
  if cl.expires_at < now() then raise exception 'The 24 hours are up'; end if;
  if exists (select 1 from kc_claims where player_id = cl.player_id and status = 'matched' and season = cl.season and league_id = public.current_league()) then
    raise exception 'You''ve already matched for him this season';
  end if;
  if public.kc_bank(cl.seller_team) < cl.price_kt then raise exception 'You need % KT to match and have %', cl.price_kt, public.kc_bank(cl.seller_team); end if;
  select * into c from kc_contracts where id = cl.contract_id for update;
  new_tier := case c.tier when 'standard' then 'high' else 'none' end;
  perform public.kc_pay(cl.seller_team, -cl.price_kt, 'Matched clause (burned): ' || public.kc_pname(cl.player_id));
  perform public.kc_pay(cl.buyer_team, cl.price_kt, 'Clause refunded, matched: ' || public.kc_pname(cl.player_id));
  update kc_contracts set tier = new_tier, salary_k = round(base_k * public.kc_premium(new_tier))::int, updated_at = now() where id = c.id;
  update kc_claims set status = 'matched' where id = cl.id;
  perform public.kc_log(cl.player_id, cl.buyer_team, cl.seller_team, 'match', cl.price_kt, cl.price_kt, 'Matched. Clause now ' || new_tier);
  return new_tier;
end $$;

-- Not matched (his club lets him go, or 24h pass): agreed. His club keeps him this season and is paid now (less the
-- levy); the rest of his contract moves to the buyer from next season.
create or replace function public.kc_complete_claim(claim_id bigint) returns text language plpgsql security definer set search_path = public as $$
declare cl kc_claims; c kc_contracts; k kc_settings; levy int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into cl from kc_claims where id = claim_id and status = 'pending' and league_id = public.current_league() for update;
  if cl is null then raise exception 'That clause isn''t pending'; end if;
  if cl.expires_at > now() and cl.seller_team is distinct from public.my_team_id() and not public.is_commish() then
    raise exception 'His club has until the 24 hours are up to match';
  end if;
  select * into c from kc_contracts where id = cl.contract_id and status = 'active' for update;
  if c is null or c.team_id <> cl.seller_team or c.end_season <= k.season
     or public.kc_salary(cl.buyer_team, k.season + 1) + c.salary_k > k.season_cap_k then
    perform public.kc_pay(cl.buyer_team, cl.price_kt, 'Clause refunded: ' || public.kc_pname(cl.player_id));
    update kc_claims set status = 'cancelled' where id = cl.id;
    return 'cancelled';
  end if;
  levy := cl.price_kt * k.levy_pct / 100;
  perform public.kc_pay(cl.seller_team, cl.price_kt - levy, 'Sold on release clause: ' || public.kc_pname(cl.player_id));
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status)
  values (c.player_id, cl.buyer_team, c.base_k, c.salary_k, k.season + 1, c.end_season, c.tier, c.rookie, false, 'clause', 'pending');
  update kc_contracts set end_season = k.season, updated_at = now() where id = c.id;
  update kc_auctions set status = 'cancelled' where contract_id = c.id and status = 'open';
  update kc_claims set status = 'completed' where id = cl.id;
  perform public.kc_log(cl.player_id, cl.seller_team, cl.buyer_team, 'clause', cl.price_kt, levy, 'Joins at season end');
  return 'completed';
end $$;

-- Release: not once he's agreed to join another club; 50% of what's left, capped at a year.
create or replace function public.kc_release(cid bigint) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; remaining int; dead int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can release him'; end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s agreed to join another club at season end'; end if;
  if exists (select 1 from kc_claims where contract_id = c.id and status = 'pending') then raise exception 'His clause has been paid. Match it or let him go first'; end if;
  if exists (select 1 from kc_auctions where contract_id = c.id and status = 'open') then raise exception 'He''s up for auction. Cancel that first'; end if;
  remaining := (c.end_season - greatest(c.start_season, k.season) + 1) * c.salary_k;
  dead := least(remaining / 2, c.salary_k);
  update kc_contracts set status = 'released', dead_k = dead, dead_season = k.season, updated_at = now() where id = c.id;
  update kc_contracts set status = 'voided', updated_at = now()
   where player_id = c.player_id and status = 'pending' and team_id = c.team_id and league_id = public.current_league();
  update kc_free_agents set kind = 'open', closes_at = case when k.window_open then k.window_closes_at else null end
   where player_id = c.player_id and status = 'open' and kind = 'pending' and league_id = public.current_league();
  insert into kc_free_agents (player_id, ex_team, closes_at) values (c.player_id, c.team_id, case when k.window_open then k.window_closes_at else null end)
    on conflict do nothing;
  perform public.kc_log(c.player_id, c.team_id, null, 'release', 0, 0, '$' || dead || 'k dead money');
  return dead;
end $$;

-- Auctions settle straight away, so they only run while the window is open, and not for a player who's spoken for.
create or replace function public.kc_list_auction(cid bigint, reserve int, hours int default 24) returns bigint language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; aid bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if not k.window_open or k.window_closes_at < now() then raise exception 'Auctions only run while the window is open'; end if;
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league();
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() then raise exception 'You can only auction your own players'; end if;
  if public.kc_moving(c.player_id, c.team_id) or public.kc_is_pending(c.player_id) then raise exception 'He''s spoken for at season end'; end if;
  if c.end_season <= k.season then raise exception 'He''s in his final year. Nothing left on his contract to sell'; end if;
  if reserve < 0 then raise exception 'Reserve can''t be negative'; end if;
  insert into kc_auctions (contract_id, player_id, seller_team, reserve_kt, ends_at)
  values (c.id, c.player_id, c.team_id, reserve, least(k.window_closes_at, now() + make_interval(hours => greatest(1, least(hours, 168)))))
  returning id into aid;
  return aid;
end $$;

-- Settle an auction: the winner takes the rest of his contract from next season; the seller keeps him this season.
create or replace function public.kc_settle(aid bigint) returns text language plpgsql security definer set search_path = public as $$
declare a kc_auctions; k kc_settings; b record; c kc_contracts; levy int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into a from kc_auctions where id = aid and status = 'open' and league_id = public.current_league() for update;
  if a is null then raise exception 'That auction isn''t open'; end if;
  if a.ends_at > now() and not public.is_commish() then raise exception 'The clock hasn''t run out yet'; end if;
  select * into c from kc_contracts where id = a.contract_id and status = 'active' for update;
  if c is null or c.end_season <= k.season or public.kc_moving(c.player_id, c.team_id) then
    update kc_auctions set status = 'cancelled' where id = aid; return 'cancelled';
  end if;
  for b in select * from kc_bids where auction_id = aid order by amount_kt desc, created_at loop
    if public.kc_bank(b.team_id) >= b.amount_kt and public.kc_salary(b.team_id, k.season + 1) + c.salary_k <= k.season_cap_k then
      levy := b.amount_kt * k.levy_pct / 100;
      perform public.kc_pay(b.team_id, -b.amount_kt, 'Won auction: ' || public.kc_pname(c.player_id));
      perform public.kc_pay(a.seller_team, b.amount_kt - levy, 'Sold at auction: ' || public.kc_pname(c.player_id));
      insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status)
      values (c.player_id, b.team_id, c.base_k, c.salary_k, k.season + 1, c.end_season, c.tier, c.rookie, false, 'auction', 'pending');
      update kc_contracts set end_season = k.season, updated_at = now() where id = c.id;
      update kc_auctions set status = 'sold', winner_team = b.team_id, price_kt = b.amount_kt where id = aid;
      perform public.kc_log(c.player_id, a.seller_team, b.team_id, 'auction', b.amount_kt, levy, 'Joins at season end');
      return 'sold';
    end if;
  end loop;
  update kc_auctions set status = 'unsold' where id = aid;
  return 'unsold';
end $$;

-- 5. Mid-season: final-year players who haven't been extended (draftees included) become pending free agents ---------------------------------
create or replace function public.kc_start_midseason() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; n int;
begin
  if not public.is_commish() then raise exception 'Only the commish can start mid-season week'; end if;
  select * into k from kc_settings where league_id = public.current_league() for update;
  if k.midseason_at is not null then raise exception 'Mid-season week has already started this season'; end if;
  insert into kc_free_agents (player_id, ex_team, kind)
  select c.player_id, c.team_id, 'pending' from kc_contracts c
   where c.status = 'active' and c.end_season <= k.season and c.league_id = public.current_league()
     and not exists (select 1 from kc_contracts x where x.player_id = c.player_id and x.status = 'pending' and x.league_id = c.league_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  update kc_settings set midseason_at = now(), updated_at = now() where league_id = public.current_league();
  perform public.kc_log(null::int, null, null, 'pending', 0, 0, 'Mid-season week: ' || n || ' players are now pending free agents');
  return n;
end $$;

-- Offers: for a pending free agent the sweetener is the transfer fee to his club and the deal starts next season.
create or replace function public.kc_offer(faid bigint, p_years int, p_salary int, new_tier text, sweet int, picks_in int[]) returns int language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; k kc_settings; me int := public.my_team_id(); minimum int; old kc_offers; sc int; check_season int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  select * into f from kc_free_agents where id = faid and status = 'open' and league_id = public.current_league();
  if f is null then raise exception 'He''s no longer a free agent'; end if;
  if f.ex_team = me and f.kind = 'pending' then raise exception 'He''s yours. You can''t bid on your own player'; end if;
  if f.closes_at is not null and f.closes_at < now() then raise exception 'Offers for him have closed'; end if;
  if p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  minimum := greatest(5, round(public.kc_rate(f.player_id) * public.kc_length_factor(p_years)))::int;
  if p_salary < minimum then raise exception 'The minimum for % years is $%k a year', p_years, minimum; end if;
  if sweet < 0 then raise exception 'The fee can''t be negative'; end if;
  if exists (select 1 from unnest(coalesce(picks_in, '{}')) pid where not exists (select 1 from picks where id = pid and owner_team_id = me)) then
    raise exception 'You can only offer picks you own';
  end if;
  check_season := case when f.kind = 'pending' then k.season + 1 else k.season end;
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

-- The owner of a pending free agent accepts one offer: they get the fee, he finishes the season, then moves.
create or replace function public.kc_accept_offer(oid bigint) returns text language plpgsql security definer set search_path = public as $$
declare o kc_offers; f kc_free_agents; k kc_settings; r record; base int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into o from kc_offers where id = oid and status = 'tabled' and league_id = public.current_league() for update;
  if o is null then raise exception 'That offer isn''t open'; end if;
  select * into f from kc_free_agents where id = o.fa_id and status = 'open' and kind = 'pending' for update;
  if f is null then raise exception 'He''s not a pending free agent'; end if;
  if f.ex_team is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can accept'; end if;
  for r in select * from kc_offers where fa_id = f.id and status = 'tabled' and id <> o.id loop
    perform public.kc_pay(r.team_id, r.sweet_kt, 'Offer refunded: ' || public.kc_pname(f.player_id));
    update kc_offers set status = 'lost', updated_at = now() where id = r.id;
  end loop;
  update kc_offers set status = 'won', updated_at = now() where id = o.id;
  perform public.kc_pay(f.ex_team, o.sweet_kt, 'Transfer fee: ' || public.kc_pname(f.player_id));
  base := o.salary_k;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how, status)
  values (f.player_id, o.team_id, base, round(base * public.kc_premium(o.tier))::int, k.season + 1, k.season + o.years, o.tier, 'free_agent', 'pending');
  update kc_free_agents set status = 'signed', signed_team = o.team_id where id = f.id;
  perform public.kc_log(f.player_id, f.ex_team, o.team_id, 'free_agent', o.sweet_kt, 0,
    'Agreed: moves at season end, ' || o.years || ' yrs at $' || round(base * public.kc_premium(o.tier)) || 'k'
    || case when array_length(o.pick_ids, 1) > 0 then ' + picks (noted only)' else '' end);
  return 'accepted';
end $$;

-- Close offers on an open (not pending) free agent. Pending ones are decided by their club.
create or replace function public.kc_close_fa(faid bigint) returns text language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; k kc_settings; w kc_offers; o record; base int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into f from kc_free_agents where id = faid and status = 'open' and league_id = public.current_league() for update;
  if f is null then raise exception 'He''s not an open free agent'; end if;
  if f.kind = 'pending' then raise exception 'His club decides which offer to take'; end if;
  if (f.closes_at is null or f.closes_at > now()) and not public.is_commish() then raise exception 'Offers are still open'; end if;
  select o2.* into w from kc_offers o2
    left join ladder l on l.team_id = o2.team_id and l.league_id = o2.league_id and l.season = (select max(season) from ladder where league_id = public.current_league())
   where o2.fa_id = faid and o2.status = 'tabled'
   order by o2.score desc, l.rank desc nulls last, o2.created_at limit 1;
  if w.id is null then update kc_free_agents set status = 'unsigned' where id = faid; return 'unsigned'; end if;
  for o in select * from kc_offers where fa_id = faid and status = 'tabled' and id <> w.id loop
    perform public.kc_pay(o.team_id, o.sweet_kt, 'Offer refunded: ' || public.kc_pname(f.player_id));
    update kc_offers set status = 'lost', updated_at = now() where id = o.id;
  end loop;
  update kc_offers set status = 'won', updated_at = now() where id = w.id;
  if f.ex_team is not null and w.sweet_kt > 0 then perform public.kc_pay(f.ex_team, w.sweet_kt, 'Compensation: ' || public.kc_pname(f.player_id)); end if;
  base := w.salary_k;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how)
  values (f.player_id, w.team_id, base, round(base * public.kc_premium(w.tier))::int, k.season, k.season + w.years - 1, w.tier, 'free_agent');
  update kc_free_agents set status = 'signed', signed_team = w.team_id where id = faid;
  perform public.kc_log(f.player_id, f.ex_team, w.team_id, 'free_agent', w.sweet_kt, 0, w.years || ' yrs at $' || round(base * public.kc_premium(w.tier)) || 'k');
  return 'signed';
end $$;

-- 6. Draft day: draftees get a one-season deal priced by round (rookies = 10 or fewer career games, at half) -----------
create or replace function public.kc_sign_draftees() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; n int;
begin
  if not public.is_commish() then raise exception 'Only the commish can price the draft'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how)
  select s.player_id, s.team_id, sal, sal, k.season, k.season, 'standard', rk, true, 'draft'
    from (
      select s.player_id, s.team_id, coalesce(p.career_games, 0) <= 10 rk,
             public.kc_draft_salary(coalesce((select dp.round from draft_room_picks dp
                where dp.year = k.season and dp.league_id = public.current_league() and (dp.player_key = s.player_id::text or (dp.player ->> 'id') = s.player_id::text) limit 1), 4),
               coalesce(p.career_games, 0) <= 10) sal
        from squad s join players p on p.id = s.player_id
       where s.league_id = public.current_league()
         and not exists (select 1 from kc_contracts c where c.player_id = s.player_id and c.status = 'active' and c.league_id = s.league_id)
    ) s;
  get diagnostics n = row_count;
  perform public.kc_log(null::int, null, null, 'draft', 0, 0, n || ' draftees signed on one-season deals');
  return n;
end $$;

-- 7. Keeper lock-in: max 17 + 1, under the keeper cap, or a deficit of up to deficit_max (not two years running) ------
create or replace function public.kc_lockin(t int) returns text language plpgsql security definer set search_path = public as $$
declare k kc_settings; s int; sal int; cap int; over int; kept int;
begin
  if t is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only the club can lock in its keepers'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  s := k.season + 1;
  kept := public.kc_kept_count(t, s);
  if kept > 18 then raise exception 'You''re keeping % players. The most is 17 + 1 rookie', kept; end if;
  sal := public.kc_salary(t, s); cap := public.kc_keeper_cap(t, s); over := sal - cap;
  if over <= 0 then return 'ok'; end if;
  if over > k.deficit_max_k then raise exception '$%k over the keeper cap. The most you can carry is $%k', over, k.deficit_max_k; end if;
  if exists (select 1 from kc_cap_adjust where team_id = t and season = s and league_id = public.current_league()) then
    raise exception 'You ran a deficit last year, so you can''t run one again';
  end if;
  insert into kc_cap_adjust (team_id, season, amount_k, reason) values (t, s + 1, over, s || ' deficit')
    on conflict (league_id, team_id, season) do update set amount_k = excluded.amount_k;
  perform public.kc_log(null::int, t, t, 'deficit', 0, 0, '$' || over || 'k deficit for ' || s || ': ' || (s + 1) || ' keeper cap drops by that');
  return 'deficit';
end $$;

-- Rollover: every club must be within its keeper cap (+ allowed deficit). Unclaimed pending free agents go open.
create or replace function public.kc_rollover() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; r record; n int := 0; bad text := '';
begin
  if not public.is_commish() then raise exception 'Only the commish can roll the season over'; end if;
  select * into k from kc_settings where league_id = public.current_league() for update;
  if k.window_open then raise exception 'Close the window first'; end if;
  for r in select id, name from teams where league_id = public.current_league() and not coalesce(is_guest, false) loop
    if public.kc_kept_count(r.id, k.season + 1) > 18
       or public.kc_salary(r.id, k.season + 1) > public.kc_keeper_cap(r.id, k.season + 1)
          + case when exists (select 1 from kc_cap_adjust where team_id = r.id and season = k.season + 1 and league_id = public.current_league()) then 0 else k.deficit_max_k end then
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
  update kc_free_agents set kind = 'open', closes_at = null where status = 'open' and kind = 'pending' and league_id = public.current_league();
  update kc_contracts set status = 'active', updated_at = now() where status = 'pending' and start_season <= k.season + 1 and league_id = public.current_league();
  update kc_settings set season = k.season + 1, midseason_at = null, updated_at = now() where league_id = public.current_league();
  insert into kc_ledger (team_id, delta, reason)
  select id, k.start_kt, (k.season + 1) || ' starting bank' from teams where league_id = public.current_league() and not coalesce(is_guest, false);
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, 'Rolled over to ' || (k.season + 1) || ': ' || n || ' free agents');
  return n;
end $$;

-- 8. Ownership --------------------------------------------------------------------------------------------------------
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
