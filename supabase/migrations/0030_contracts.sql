-- Contracts, salary cap and the transfer market (shadow season).
--
-- Everything here is additive: new kc_* tables and functions only. Nothing existing changes.
-- Shadow mode (kc_settings.shadow = true, the default): contracts, banks and transfers are a paper league. Real lists
-- (squad), real tokens (token_ledger) and real picks are never touched. Turning shadow off later is a separate change.
--
-- Money units
--   * Salaries are cap dollars, stored in thousands ($98,000 = 98). Never real money.
--   * Paper tokens (KT) live in kc_ledger, apart from real tokens. Each club starts a season with kc_settings.start_kt.
--
-- One formula for a player's market rate (kc_rate) lives here so the database and the site always agree.
-- League-scoped like every other league table (see 0027/0028). Members read; changes only go through the
-- functions below (plus the commish editing kc_settings).

-- 1. Tables ----------------------------------------------------------------------------------------------------------
create table if not exists public.kc_settings (
  league_id        int primary key default public.current_league() references public.leagues(id) on delete cascade,
  season           int not null default 2027,
  shadow           boolean not null default true,
  keeper_cap_k     int not null default 1000 check (keeper_cap_k between 50 and 100000),
  season_cap_k     int not null default 1250 check (season_cap_k between 50 and 100000),
  tax_line_k       int not null default 1100 check (tax_line_k between 50 and 100000),
  tax_kt_per_k     int not null default 10   check (tax_kt_per_k between 0 and 1000),
  start_kt         int not null default 10000 check (start_kt between 0 and 1000000),
  max_years        int not null default 5    check (max_years between 1 and 10),
  long_deal_limit  int not null default 3    check (long_deal_limit between 0 and 33),
  floor_def        int not null default 8, floor_mid int not null default 10, floor_ruc int not null default 2, floor_fwd int not null default 8,
  clause_std       int not null default 3    check (clause_std between 1 and 20),
  clause_high      int not null default 5    check (clause_high between 1 and 30),
  kt_per_k         int not null default 50   check (kt_per_k between 1 and 1000),
  high_pct         int not null default 10   check (high_pct between 0 and 100),
  none_pct         int not null default 20   check (none_pct between 0 and 100),
  home_grown_pct   int not null default 25   check (home_grown_pct between 0 and 90),
  levy_pct         int not null default 10   check (levy_pct between 0 and 50),
  max_buys         int not null default 2    check (max_buys between 0 and 10),
  pot_dollars      int not null default 1000 check (pot_dollars between 0 and 1000000),
  window_open      boolean not null default false,
  window_kind      text check (window_kind in ('preseason', 'midseason')),
  window_opened_at timestamptz,
  window_closes_at timestamptz,
  seeded_at        timestamptz,
  updated_at       timestamptz not null default now()
);

create table if not exists public.kc_contracts (
  id           bigint generated always as identity primary key,
  league_id    int not null default public.current_league() references public.leagues(id) on delete cascade,
  player_id    int not null,
  team_id      int not null references public.teams(id) on delete cascade,
  base_k       int not null check (base_k between 1 and 5000),   -- salary before the clause premium
  salary_k     int not null check (salary_k between 1 and 6000), -- what counts against the cap
  start_season int not null,
  end_season   int not null,
  tier         text not null default 'standard' check (tier in ('standard', 'high', 'none', 'protected')),
  rookie       boolean not null default false,
  home_grown   boolean not null default false,
  how          text not null default 'seed' check (how in ('seed', 'rookie', 'draft', 'extension', 'free_agent', 'clause', 'auction', 'trade')),
  status       text not null default 'active' check (status in ('active', 'pending', 'released', 'expired', 'voided')),  -- pending = an extension that starts next season
  dead_k       int not null default 0,
  dead_season  int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_season >= start_season)
);
create unique index if not exists kc_contracts_one_active on public.kc_contracts (league_id, player_id) where status = 'active';
create index if not exists kc_contracts_team on public.kc_contracts (league_id, team_id, status);

create table if not exists public.kc_ledger (
  id         bigint generated always as identity primary key,
  league_id  int not null default public.current_league() references public.leagues(id) on delete cascade,
  team_id    int not null references public.teams(id) on delete cascade,
  delta      int not null,
  reason     text not null check (length(reason) between 1 and 160),
  created_at timestamptz not null default now()
);
create index if not exists kc_ledger_team on public.kc_ledger (league_id, team_id);

create table if not exists public.kc_auctions (
  id          bigint generated always as identity primary key,
  league_id   int not null default public.current_league() references public.leagues(id) on delete cascade,
  contract_id bigint not null references public.kc_contracts(id) on delete cascade,
  player_id   int not null,
  seller_team int not null references public.teams(id) on delete cascade,
  reserve_kt  int not null check (reserve_kt between 0 and 1000000),
  ends_at     timestamptz not null,
  status      text not null default 'open' check (status in ('open', 'sold', 'unsold', 'cancelled')),
  winner_team int references public.teams(id),
  price_kt    int,
  created_at  timestamptz not null default now()
);
create unique index if not exists kc_auctions_one_open on public.kc_auctions (league_id, contract_id) where status = 'open';

create table if not exists public.kc_bids (
  id         bigint generated always as identity primary key,
  league_id  int not null default public.current_league() references public.leagues(id) on delete cascade,
  auction_id bigint not null references public.kc_auctions(id) on delete cascade,
  team_id    int not null references public.teams(id) on delete cascade,
  amount_kt  int not null check (amount_kt between 1 and 1000000),
  created_at timestamptz not null default now()
);
create index if not exists kc_bids_auction on public.kc_bids (auction_id, amount_kt desc);

-- Free agents: players whose contract ran out or was released. One open row per player.
create table if not exists public.kc_free_agents (
  id         bigint generated always as identity primary key,
  league_id  int not null default public.current_league() references public.leagues(id) on delete cascade,
  player_id  int not null,
  ex_team    int references public.teams(id),
  opened_at  timestamptz not null default now(),
  closes_at  timestamptz,
  status     text not null default 'open' check (status in ('open', 'signed', 'unsigned')),
  signed_team int references public.teams(id)
);
create unique index if not exists kc_free_agents_one_open on public.kc_free_agents (league_id, player_id) where status = 'open';

create table if not exists public.kc_offers (
  id          bigint generated always as identity primary key,
  league_id   int not null default public.current_league() references public.leagues(id) on delete cascade,
  fa_id       bigint not null references public.kc_free_agents(id) on delete cascade,
  player_id   int not null,
  team_id     int not null references public.teams(id) on delete cascade,
  years       int not null check (years between 1 and 10),
  salary_k    int not null check (salary_k between 1 and 6000),   -- per year, before the clause premium
  tier        text not null check (tier in ('standard', 'high', 'none')),
  sweet_kt    int not null default 0 check (sweet_kt between 0 and 1000000),
  pick_ids    int[] not null default '{}',
  score       int not null default 0,
  status      text not null default 'tabled' check (status in ('tabled', 'won', 'lost')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists kc_offers_one_per_club on public.kc_offers (league_id, fa_id, team_id);

create table if not exists public.kc_transfers (
  id          bigint generated always as identity primary key,
  league_id   int not null default public.current_league() references public.leagues(id) on delete cascade,
  player_id   int,
  from_team   int references public.teams(id),
  to_team     int references public.teams(id),
  kind        text not null check (kind in ('clause', 'auction', 'free_agent', 'release', 'extension', 'tier', 'seed')),
  fee_kt      int not null default 0,
  levy_kt     int not null default 0,
  note        text check (length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists kc_transfers_recent on public.kc_transfers (league_id, created_at desc);

-- 2. Row security: league scope, definer access, members read, commish edits settings -------------------------------
do $$
declare t text;
begin
  foreach t in array array['kc_settings', 'kc_contracts', 'kc_ledger', 'kc_auctions', 'kc_bids', 'kc_free_agents', 'kc_offers', 'kc_transfers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "league scope" on public.%I', t);
    execute format('create policy "league scope" on public.%I as restrictive for all using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()))', t);
    execute format('drop policy if exists "definer access" on public.%I', t);
    execute format('create policy "definer access" on public.%I for all to khq_definer using (true) with check (true)', t);
    execute format('drop policy if exists "%s: members read" on public.%I', t, t);
    execute format('create policy "%s: members read" on public.%I for select using ((select public.is_member()))', t, t);
  end loop;
end $$;
drop policy if exists "kc_settings: commish edits" on public.kc_settings;
create policy "kc_settings: commish edits" on public.kc_settings for update using ((select public.is_commish())) with check ((select public.is_commish()));

-- 3. Pricing helpers (pure) ------------------------------------------------------------------------------------------
-- Market rate in $k from an average, games played and age. Age curve rewards youth; durability discounts missed games.
create or replace function public.kc_rate_from(p_avg numeric, games int, yrs int) returns int language sql immutable as $$
  select greatest(5, round(power(greatest(coalesce(p_avg, 0) - 55, 0), 1.3) * 0.66
    * case when yrs is null then 1.0 when yrs <= 21 then 1.10 when yrs <= 24 then 1.05 when yrs <= 28 then 1.0
           when yrs = 29 then 0.92 when yrs = 30 then 0.85 when yrs = 31 then 0.78 when yrs = 32 then 0.70 else 0.62 end
    * (0.6 + 0.4 * least(1, coalesce(games, 0) / 20.0))))::int
$$;

-- Per-year price by length: longer is cheaper each year (3 years = market rate).
create or replace function public.kc_length_factor(years int) returns numeric language sql immutable as $$
  select case years when 1 then 1.06 when 2 then 1.03 when 3 then 1.0 when 4 then 0.967 else 0.933 end
$$;

create or replace function public.kc_draft_salary(rnd int, rookie boolean) returns int language sql immutable as $$
  select (case when rnd <= 1 then 16 when rnd = 2 then 12 when rnd = 3 then 9 else 6 end) * (case when rookie then 1 else 2 end)
$$;

-- 4. League-aware helpers --------------------------------------------------------------------------------------------
create or replace function public.kc_cfg() returns public.kc_settings language sql stable security definer set search_path = public as $$
  select * from kc_settings where league_id = public.current_league()
$$;

-- A player's market rate now: last two seasons weighted by games (the newer season counts 1.5×), at his age on 1 March.
create or replace function public.kc_rate(pid int) returns int language sql stable security definer set search_path = public as $$
  with s as (
    select average, games, season, row_number() over (order by season desc) rn
      from player_seasons where player_id = pid and average is not null and coalesce(games, 0) > 0
  ), w as (
    select sum(average * games * case when rn = 1 then 1.5 else 1 end) / nullif(sum(games * case when rn = 1 then 1.5 else 1 end), 0) avg,
           max(games) filter (where rn = 1) g
      from s where rn <= 2
  )
  select public.kc_rate_from(w.avg, w.g,
           date_part('year', age(make_date(coalesce((select season from kc_settings where league_id = public.current_league()), 2027), 3, 1), p.birth_date))::int)
    from w, players p where p.id = pid
$$;

create or replace function public.kc_rates() returns table (player_id int, rate_k int) language sql stable security definer set search_path = public as $$
  select p.id, public.kc_rate(p.id) from players p
$$;

create or replace function public.kc_bank(t int) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from kc_ledger where team_id = t and league_id = public.current_league()
$$;

-- Salary a club carries in a season: active contracts covering it plus dead money landing in it.
create or replace function public.kc_salary(t int, s int) returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(salary_k) from kc_contracts where team_id = t and status in ('active', 'pending') and start_season <= s and end_season >= s and league_id = public.current_league()), 0)
        + coalesce((select sum(dead_k) from kc_contracts where team_id = t and dead_season = s and league_id = public.current_league()), 0))::int
$$;

-- The paper list: a club's real squad, minus players whose contract now sits with another club, plus contracts it holds.
create or replace function public.kc_list(t int) returns table (player_id int) language sql stable security definer set search_path = public as $$
  select s.player_id from squad s
   where s.team_id = t and s.league_id = public.current_league()
     and not exists (select 1 from kc_contracts c where c.player_id = s.player_id and c.status = 'active' and c.team_id <> t and c.league_id = public.current_league())
  union
  select c.player_id from kc_contracts c where c.team_id = t and c.status = 'active' and c.league_id = public.current_league()
$$;

-- Fit players a club has on a line (primary position), optionally pretending one player has gone.
create or replace function public.kc_fit_count(t int, line text, without int default null) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.kc_list(t) l
    join players p on p.id = l.player_id
    left join lateral (select status from player_seasons where player_id = p.id order by season desc limit 1) st on true
   where p.positions[1] = line and l.player_id is distinct from without
     and coalesce(st.status, '') not in ('LONG', 'SEASON', 'OUT', 'SUSP', 'DEL')
$$;

create or replace function public.kc_floor_for(line text) returns int language sql stable security definer set search_path = public as $$
  select case line when 'DEF' then floor_def when 'MID' then floor_mid when 'RUC' then floor_ruc else floor_fwd end
    from kc_settings where league_id = public.current_league()
$$;

-- Release clause in KT: market rate × multiplier × KT per $1k, halved in the final year. Null = can't be bought.
create or replace function public.kc_clause(cid bigint) returns int language sql stable security definer set search_path = public as $$
  select case when c.tier in ('none', 'protected') then null
    else (public.kc_rate(c.player_id) * case when c.tier = 'high' then k.clause_high else k.clause_std end * k.kt_per_k
          * case when c.end_season <= k.season then 0.5 else 1 end)::int end
    from kc_contracts c join kc_settings k on k.league_id = c.league_id
   where c.id = cid and c.league_id = public.current_league()
$$;

create or replace function public.kc_premium(tier text) returns numeric language sql stable security definer set search_path = public as $$
  select 1 + case tier when 'high' then high_pct when 'none' then none_pct else 0 end / 100.0
    from kc_settings where league_id = public.current_league()
$$;

-- Offer score: total contract value + tokens / 50 + pick points / 50.
create or replace function public.kc_offer_score(years int, salary_k int, sweet_kt int, pick_ids int[]) returns int language sql stable security definer set search_path = public as $$
  select (years * salary_k + coalesce(sweet_kt, 0) / 50
    + coalesce((select sum(round(3000 * exp(-0.07 * (coalesce(overall, (round - 1) * 10 + 5) - 1)) / 50)) from picks where id = any(pick_ids)), 0))::int
$$;

create or replace function public.kc_log(pid int, f int, t int, k text, fee int, levy int, n text) returns void language sql security definer set search_path = public as $$
  insert into kc_transfers (player_id, from_team, to_team, kind, fee_kt, levy_kt, note) values (pid, f, t, k, coalesce(fee, 0), coalesce(levy, 0), n)
$$;

create or replace function public.kc_pay(t int, amount int, why text) returns void language sql security definer set search_path = public as $$
  insert into kc_ledger (team_id, delta, reason) select t, amount, why where amount <> 0
$$;

create or replace function public.kc_pname(pid int) returns text language sql stable security definer set search_path = public as $$
  select coalesce(name, 'Player ' || pid) from players where id = pid
$$;

-- 5. Commish: set up the shadow season --------------------------------------------------------------------------------
-- Creates contracts for every kept player (17 + rookie keeper) and gives every club its starting bank.
-- Rookie deals (debuted 2024 or later, 23 or under) get the cheap draft scale and are marked home-grown.
-- Everyone else signs at market rate for a length set by age; the best three young players per club get 4 years.
create or replace function public.kc_seed() returns int language plpgsql security definer set search_path = public as $$
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
    select *, case when is_rookie then public.kc_draft_salary(case when draft_pick is null then 4 when draft_pick <= 10 then 1 when draft_pick <= 25 then 2 when draft_pick <= 45 then 3 else 4 end, true)
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
  -- Every club starts under the keeper cap: if one wouldn't, lift the caps (rounded up to the next $50k) until they fit.
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
end $$;

-- Commish: open or close a transfer window.
create or replace function public.kc_window(p_open boolean, p_kind text default 'preseason', p_hours int default 72) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Only the commish can open or close windows'; end if;
  if p_kind not in ('preseason', 'midseason') then raise exception 'Window is preseason or midseason'; end if;
  if p_open then
    update kc_settings set window_open = true, window_kind = p_kind, window_opened_at = now(), window_closes_at = now() + make_interval(hours => greatest(1, p_hours)), updated_at = now()
     where league_id = public.current_league();
  else
    update kc_settings set window_open = false, updated_at = now() where league_id = public.current_league();
  end if;
end $$;

-- Commish: paper tokens in or out (prizes, fines, corrections).
create or replace function public.kc_grant(t int, amount int, why text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Only the commish can grant tokens'; end if;
  if why is null or length(trim(why)) = 0 then raise exception 'Give a reason'; end if;
  perform public.kc_pay(t, amount, left(why, 160));
end $$;

-- Commish: charge luxury tax for the season and share it among the bottom three of the last ladder.
create or replace function public.kc_charge_tax() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; r record; total int := 0; share int; bottoms int[];
begin
  if not public.is_commish() then raise exception 'Only the commish can charge luxury tax'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  if exists (select 1 from kc_ledger where reason = k.season || ' luxury tax' and league_id = public.current_league()) then
    raise exception 'Luxury tax for % has already been charged', k.season;
  end if;
  for r in select id from teams where league_id = public.current_league() and not coalesce(is_guest, false) loop
    if public.kc_salary(r.id, k.season) > k.tax_line_k then
      share := (public.kc_salary(r.id, k.season) - k.tax_line_k) * k.tax_kt_per_k;
      perform public.kc_pay(r.id, -share, k.season || ' luxury tax');
      total := total + share;
    end if;
  end loop;
  select array_agg(team_id) into bottoms from (
    select team_id from ladder where league_id = public.current_league() and season = (select max(season) from ladder where league_id = public.current_league())
     order by rank desc limit 3) b;
  if total > 0 and coalesce(array_length(bottoms, 1), 0) > 0 then
    for i in 1 .. array_length(bottoms, 1) loop
      perform public.kc_pay(bottoms[i], total / array_length(bottoms, 1), k.season || ' luxury tax share');
    end loop;
  end if;
  return total;
end $$;

-- 6. Coaches: manage your own contracts ------------------------------------------------------------------------------
-- Extend a player in his final year. Price = market rate × length factor, 25% off if home-grown, plus clause premium.
-- The new deal waits as 'pending' and takes over when the commish rolls the season over.
create or replace function public.kc_extend(cid bigint, p_years int, new_tier text) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; base int; sal int; long_count int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can extend him'; end if;
  if c.end_season > k.season then raise exception 'You can only extend a player in his final year'; end if;
  if exists (select 1 from kc_contracts where player_id = c.player_id and status = 'pending' and league_id = public.current_league()) then
    raise exception 'He''s already extended';
  end if;
  if p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  if p_years >= 4 then
    select count(*) into long_count from kc_contracts
     where team_id = c.team_id and status in ('active', 'pending') and player_id <> c.player_id and league_id = public.current_league() and end_season - start_season + 1 >= 4;
    if long_count >= k.long_deal_limit then raise exception 'You already have % deals of 4+ years', k.long_deal_limit; end if;
  end if;
  base := greatest(5, round(public.kc_rate(c.player_id) * public.kc_length_factor(p_years) * case when c.home_grown then (100 - k.home_grown_pct) / 100.0 else 1 end))::int;
  sal := round(base * public.kc_premium(new_tier))::int;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status)
  values (c.player_id, c.team_id, base, sal, k.season + 1, k.season + p_years, new_tier, false, c.home_grown, 'extension', 'pending');
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'extension', 0, 0, p_years || ' yrs at $' || sal || 'k from ' || (k.season + 1));
  return sal;
end $$;

-- Change a release clause level outside a window. Salary moves with the premium.
create or replace function public.kc_set_tier(cid bigint, new_tier text) returns void language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can change his clause'; end if;
  if k.window_open then raise exception 'Clauses are locked while a window is open'; end if;
  if c.tier = 'protected' then raise exception 'A rookie keeper is protected in his first year'; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick standard, high or none'; end if;
  update kc_contracts set tier = new_tier, salary_k = round(base_k * public.kc_premium(new_tier))::int, updated_at = now() where id = c.id;
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'tier', 0, 0, 'Clause set to ' || new_tier);
end $$;

-- Release a player. Half his remaining salary stays on the cap as dead money (never more than one year's salary),
-- landing next season. He becomes a free agent.
create or replace function public.kc_release(cid bigint) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; remaining int; dead int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can release him'; end if;
  if exists (select 1 from kc_auctions where contract_id = c.id and status = 'open') then raise exception 'He''s up for auction. Cancel that first'; end if;
  remaining := (c.end_season - greatest(c.start_season, k.season) + 1) * c.salary_k;
  dead := least(remaining / 2, c.salary_k);
  update kc_contracts set status = 'released', dead_k = dead, dead_season = k.season, updated_at = now() where id = c.id;
  -- Any extension waiting to start goes too.
  update kc_contracts set status = 'voided', updated_at = now() where player_id = c.player_id and status = 'pending' and league_id = public.current_league();
  insert into kc_free_agents (player_id, ex_team, closes_at) values (c.player_id, c.team_id, case when k.window_open then k.window_closes_at else null end)
    on conflict do nothing;
  perform public.kc_log(c.player_id, c.team_id, null, 'release', 0, 0, '$' || dead || 'k dead money');
  return dead;
end $$;

-- 7. Transfer market ------------------------------------------------------------------------------------------------
-- Pay a release clause. Window must be open, max buys per window, buyer needs the tokens and cap room, and the
-- seller must stay at or above the depth floor for that line (injured players don't count).
create or replace function public.kc_buy(cid bigint) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; me int := public.my_team_id(); price int; levy int; line text; buys int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if not k.window_open or k.window_closes_at < now() then raise exception 'Release clauses can only be paid while a window is open'; end if;
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id = me then raise exception 'He''s already yours'; end if;
  price := public.kc_clause(c.id);
  if price is null then raise exception 'He has no release clause'; end if;
  select count(*) into buys from kc_transfers where to_team = me and kind = 'clause' and created_at >= k.window_opened_at and league_id = public.current_league();
  if buys >= k.max_buys then raise exception 'You''ve used your % clause buys this window', k.max_buys; end if;
  if public.kc_bank(me) < price then raise exception 'You need % KT and have %', price, public.kc_bank(me); end if;
  if public.kc_salary(me, k.season) + c.salary_k > k.season_cap_k then raise exception 'His $%k salary would take you over the $%k season cap', c.salary_k, k.season_cap_k; end if;
  select positions[1] into line from players where id = c.player_id;
  if public.kc_fit_count(c.team_id, line, c.player_id) < public.kc_floor_for(line) then
    raise exception 'Blocked by the depth floor: they''d drop below % fit %s', public.kc_floor_for(line), line;
  end if;
  levy := price * k.levy_pct / 100;
  perform public.kc_pay(me, -price, 'Release clause: ' || public.kc_pname(c.player_id));
  perform public.kc_pay(c.team_id, price - levy, 'Sold on release clause: ' || public.kc_pname(c.player_id));
  update kc_contracts set team_id = me, how = 'clause', home_grown = false, updated_at = now() where player_id = c.player_id and status in ('active', 'pending') and league_id = public.current_league();
  update kc_auctions set status = 'cancelled' where contract_id = c.id and status = 'open';
  perform public.kc_log(c.player_id, c.team_id, me, 'clause', price, levy, null);
  return price;
end $$;

create or replace function public.kc_list_auction(cid bigint, reserve int, hours int default 24) returns bigint language plpgsql security definer set search_path = public as $$
declare c kc_contracts; aid bigint;
begin
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league();
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() then raise exception 'You can only auction your own players'; end if;
  if reserve < 0 then raise exception 'Reserve can''t be negative'; end if;
  insert into kc_auctions (contract_id, player_id, seller_team, reserve_kt, ends_at)
  values (c.id, c.player_id, c.team_id, reserve, now() + make_interval(hours => greatest(1, least(hours, 168))))
  returning id into aid;
  return aid;
end $$;

create or replace function public.kc_cancel_auction(aid bigint) returns void language plpgsql security definer set search_path = public as $$
declare a kc_auctions;
begin
  select * into a from kc_auctions where id = aid and status = 'open' and league_id = public.current_league() for update;
  if a is null then raise exception 'That auction isn''t open'; end if;
  if a.seller_team is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only the seller can cancel'; end if;
  if exists (select 1 from kc_bids where auction_id = aid) and not public.is_commish() then raise exception 'There are bids. Only the commish can cancel now'; end if;
  update kc_auctions set status = 'cancelled' where id = aid;
end $$;

create or replace function public.kc_bid(aid bigint, amount int) returns void language plpgsql security definer set search_path = public as $$
declare a kc_auctions; k kc_settings; me int := public.my_team_id(); top int; sal int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into a from kc_auctions where id = aid and status = 'open' and league_id = public.current_league() for update;
  if a is null or a.ends_at < now() then raise exception 'That auction has closed'; end if;
  if me is null then raise exception 'Sign in as a coach'; end if;
  if a.seller_team = me then raise exception 'You can''t bid on your own player'; end if;
  select coalesce(max(amount_kt), 0) into top from kc_bids where auction_id = aid;
  if amount < a.reserve_kt then raise exception 'The reserve is % KT', a.reserve_kt; end if;
  if amount <= top then raise exception 'Bid more than the top bid of % KT', top; end if;
  if public.kc_bank(me) < amount then raise exception 'You only have % KT', public.kc_bank(me); end if;
  select salary_k into sal from kc_contracts where id = a.contract_id;
  if public.kc_salary(me, k.season) + sal > k.season_cap_k then raise exception 'His $%k salary wouldn''t fit under your cap', sal; end if;
  insert into kc_bids (auction_id, team_id, amount_kt) values (aid, me, amount);
end $$;

-- Settle a finished auction (anyone can, once the clock runs out). The highest bidder who can still pay and fit him wins.
create or replace function public.kc_settle(aid bigint) returns text language plpgsql security definer set search_path = public as $$
declare a kc_auctions; k kc_settings; b record; c kc_contracts; levy int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into a from kc_auctions where id = aid and status = 'open' and league_id = public.current_league() for update;
  if a is null then raise exception 'That auction isn''t open'; end if;
  if a.ends_at > now() and not public.is_commish() then raise exception 'The clock hasn''t run out yet'; end if;
  select * into c from kc_contracts where id = a.contract_id and status = 'active';
  if c is null then update kc_auctions set status = 'cancelled' where id = aid; return 'cancelled'; end if;
  for b in select * from kc_bids where auction_id = aid order by amount_kt desc, created_at loop
    if public.kc_bank(b.team_id) >= b.amount_kt and public.kc_salary(b.team_id, k.season) + c.salary_k <= k.season_cap_k then
      levy := b.amount_kt * k.levy_pct / 100;
      perform public.kc_pay(b.team_id, -b.amount_kt, 'Won auction: ' || public.kc_pname(c.player_id));
      perform public.kc_pay(a.seller_team, b.amount_kt - levy, 'Sold at auction: ' || public.kc_pname(c.player_id));
      update kc_contracts set team_id = b.team_id, how = 'auction', home_grown = false, updated_at = now() where player_id = c.player_id and status in ('active', 'pending') and league_id = public.current_league();
      update kc_auctions set status = 'sold', winner_team = b.team_id, price_kt = b.amount_kt where id = aid;
      perform public.kc_log(c.player_id, a.seller_team, b.team_id, 'auction', b.amount_kt, levy, null);
      return 'sold';
    end if;
  end loop;
  update kc_auctions set status = 'unsold' where id = aid;
  return 'unsold';
end $$;

-- Table (or raise) a blind offer to a free agent. Salary must be at least his rate for that length. Sweetener tokens
-- are held in escrow (taken now, refunded if you lose). Picks are noted; in the shadow season no real pick moves.
create or replace function public.kc_offer(faid bigint, p_years int, p_salary int, new_tier text, sweet int, picks_in int[]) returns int language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; k kc_settings; me int := public.my_team_id(); minimum int; old kc_offers; sc int; long_count int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  select * into f from kc_free_agents where id = faid and status = 'open' and league_id = public.current_league();
  if f is null then raise exception 'He''s no longer a free agent'; end if;
  if f.closes_at is not null and f.closes_at < now() then raise exception 'Offers for him have closed'; end if;
  if p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  minimum := greatest(5, round(public.kc_rate(f.player_id) * public.kc_length_factor(p_years)))::int;
  if p_salary < minimum then raise exception 'The minimum for % years is $%k a year', p_years, minimum; end if;
  if sweet < 0 then raise exception 'Sweetener can''t be negative'; end if;
  if exists (select 1 from unnest(coalesce(picks_in, '{}')) pid where not exists (select 1 from picks where id = pid and owner_team_id = me)) then
    raise exception 'You can only offer picks you own';
  end if;
  if p_years >= 4 then
    select count(*) into long_count from kc_contracts where team_id = me and status in ('active', 'pending') and league_id = public.current_league() and end_season - start_season + 1 >= 4;
    if long_count >= k.long_deal_limit then raise exception 'You already have % deals of 4+ years', k.long_deal_limit; end if;
  end if;
  if public.kc_salary(me, k.season) + round(p_salary * public.kc_premium(new_tier)) > k.season_cap_k then
    raise exception 'That salary would take you over the $%k season cap', k.season_cap_k;
  end if;
  sc := public.kc_offer_score(p_years, p_salary, sweet, coalesce(picks_in, '{}'));
  select * into old from kc_offers where fa_id = faid and team_id = me for update;
  if old.id is not null then
    if sc < old.score then raise exception 'A tabled offer can only go up (yours scores %)', old.score; end if;
    if public.kc_bank(me) < sweet - old.sweet_kt then raise exception 'Not enough tokens for that sweetener'; end if;
    perform public.kc_pay(me, -(sweet - old.sweet_kt), 'Offer escrow: ' || public.kc_pname(f.player_id));
    update kc_offers set years = p_years, salary_k = p_salary, tier = new_tier, sweet_kt = sweet, pick_ids = coalesce(picks_in, '{}'), score = sc, updated_at = now() where id = old.id;
  else
    if public.kc_bank(me) < sweet then raise exception 'Not enough tokens for that sweetener'; end if;
    perform public.kc_pay(me, -sweet, 'Offer escrow: ' || public.kc_pname(f.player_id));
    insert into kc_offers (fa_id, player_id, team_id, years, salary_k, tier, sweet_kt, pick_ids, score)
    values (faid, f.player_id, me, p_years, p_salary, new_tier, sweet, coalesce(picks_in, '{}'), sc);
  end if;
  return sc;
end $$;

-- Close a free agent's offers (commish, or anyone once closes_at has passed). Best score wins; ties go to the lower
-- ladder club. Winner signs; sweetener goes to his former club; losers get their escrow back.
create or replace function public.kc_close_fa(faid bigint) returns text language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; k kc_settings; w kc_offers; o record; base int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into f from kc_free_agents where id = faid and status = 'open' and league_id = public.current_league() for update;
  if f is null then raise exception 'He''s not an open free agent'; end if;
  if (f.closes_at is null or f.closes_at > now()) and not public.is_commish() then raise exception 'Offers are still open'; end if;
  select o2.* into w from kc_offers o2
    left join ladder l on l.team_id = o2.team_id and l.league_id = o2.league_id and l.season = (select max(season) from ladder where league_id = public.current_league())
   where o2.fa_id = faid and o2.status = 'tabled'
   order by o2.score desc, l.rank desc nulls last, o2.created_at limit 1;
  if w.id is null then
    update kc_free_agents set status = 'unsigned' where id = faid;
    return 'unsigned';
  end if;
  for o in select * from kc_offers where fa_id = faid and status = 'tabled' and id <> w.id loop
    perform public.kc_pay(o.team_id, o.sweet_kt, 'Escrow back: ' || public.kc_pname(f.player_id));
    update kc_offers set status = 'lost', updated_at = now() where id = o.id;
  end loop;
  update kc_offers set status = 'won', updated_at = now() where id = w.id;
  if f.ex_team is not null and w.sweet_kt > 0 then perform public.kc_pay(f.ex_team, w.sweet_kt, 'Compensation: ' || public.kc_pname(f.player_id)); end if;
  base := w.salary_k;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how)
  values (f.player_id, w.team_id, base, round(base * public.kc_premium(w.tier))::int, k.season, k.season + w.years - 1, w.tier, 'free_agent');
  update kc_free_agents set status = 'signed', signed_team = w.team_id where id = faid;
  perform public.kc_log(f.player_id, f.ex_team, w.team_id, 'free_agent', w.sweet_kt, 0,
    w.years || ' yrs at $' || round(base * public.kc_premium(w.tier)) || 'k' || case when array_length(w.pick_ids, 1) > 0 then ' + picks (noted only)' else '' end);
  return 'signed';
end $$;

-- Commish: roll the season over. Finished contracts expire and those players become free agents; extensions start;
-- every club gets the new season's starting bank.
create or replace function public.kc_rollover() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; r record; n int := 0;
begin
  if not public.is_commish() then raise exception 'Only the commish can roll the season over'; end if;
  select * into k from kc_settings where league_id = public.current_league() for update;
  if k.window_open then raise exception 'Close the window first'; end if;
  for r in select * from kc_contracts where status = 'active' and end_season <= k.season and league_id = public.current_league() loop
    update kc_contracts set status = 'expired', updated_at = now() where id = r.id;
    if not exists (select 1 from kc_contracts where player_id = r.player_id and status = 'pending' and league_id = public.current_league()) then
      insert into kc_free_agents (player_id, ex_team) values (r.player_id, r.team_id) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  update kc_contracts set status = 'active', updated_at = now() where status = 'pending' and start_season <= k.season + 1 and league_id = public.current_league();
  update kc_settings set season = k.season + 1, updated_at = now() where league_id = public.current_league();
  insert into kc_ledger (team_id, delta, reason)
  select id, k.start_kt, (k.season + 1) || ' starting bank' from teams where league_id = public.current_league() and not coalesce(is_guest, false);
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, 'Rolled over to ' || (k.season + 1) || ': ' || n || ' free agents');
  return n;
end $$;

-- Commish: open free agency for a set time (sets every open free agent's closing time).
create or replace function public.kc_fa_deadline(hours int) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Only the commish can set the free-agency deadline'; end if;
  update kc_free_agents set closes_at = now() + make_interval(hours => greatest(1, hours)) where status = 'open' and league_id = public.current_league();
end $$;

-- 8. Hand the elevated functions to khq_definer (like 0028) so they stay inside the league scope ---------------------
grant create on schema public to khq_definer;
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proname like 'kc\_%'
  loop
    execute format('alter function %s owner to khq_definer', f.sig);
  end loop;
end $$;
revoke create on schema public from khq_definer;

-- Coaches call the market functions; the internal money helpers stay private.
revoke execute on function public.kc_pay(int, int, text) from public, anon, authenticated;
revoke execute on function public.kc_log(int, int, int, text, int, int, text) from public, anon, authenticated;
