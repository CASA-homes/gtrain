-- 0084: contract rules agreed 25 Nov 2026.
--   Contract deadline: one month before the league's draft by default; the commish can pick their own date. It's the
--     last day to sign or delist. Anyone still unsigned then is released into the draft pool. From the deadline to
--     draft day, lists are locked: players only move by trade.
--   Release clauses: can be activated any time. The buyer picks a length; the salary is market rate for that length,
--     never less than he earns now. His club has 48 hours to match (pay the same KT, which is burned, and give him
--     those terms). No match: he signs with the buyer and moves at the next window (straight away if one is open,
--     otherwise at season's end, playing out the season where he is). No player is dropped when you pay; you balance
--     your list when the window opens. Up to max_buys (2) clause offers per period.
--   Free agents: one week of blind offers on the Trademarket. His old club can match the best offer until the week
--     ends; then the best offer signs him. He moves at the next window.
-- Functions that change league data stay owned by khq_definer, so the league-scope rules still apply inside them.
-- (kc_settings_ready and draft_room_sets_deadline stay owned by postgres: they run inside create_league, before the
-- new league is the one in the request header.)

grant create on schema public to khq_definer;

alter table public.kc_settings add column if not exists deadline_custom boolean not null default false;
alter table public.kc_settings add column if not exists unsigned_swept_at timestamptz;
alter table public.kc_claims add column if not exists offer_years int;
alter table public.kc_claims add column if not exists offer_salary_k int;

-- ── Contract deadline ────────────────────────────────────────────────────────────────────────────────────────────

-- New settings: deadline one month before the draft (if the league has a draft date yet).
create or replace function public.kc_settings_ready() returns trigger
language plpgsql security definer set search_path = public as $$
declare d timestamptz;
begin
  new.seeded_at := coalesce(new.seeded_at, now());
  select starts_at into d from draft_room where league_id = new.league_id and year = new.season;
  if d is not null and not coalesce(new.deadline_custom, false) then new.setup_until := d - interval '1 month'; end if;
  return new;
end $$;

-- Moving the draft moves the default deadline with it, while contracts are still open and the commish hasn't set
-- their own date.
create or replace function public.draft_room_sets_deadline() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.starts_at is null then return new; end if;
  update kc_settings set setup_until = new.starts_at - interval '1 month', updated_at = now()
   where league_id = new.league_id and season = new.year and not deadline_custom
     and setup_until is distinct from new.starts_at - interval '1 month'
     and (setup_until is null or now() < setup_until);
  return new;
end $$;

-- Commish: set the contract deadline (any time before the draft), or pass null to go back to one month before it.
create or replace function public.kc_set_deadline(p_at timestamptz) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare k kc_settings; d timestamptz; v timestamptz;
begin
  if not public.is_commish() then raise exception 'Only the commish can set the contract deadline'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  if k.league_id is null then raise exception 'Contracts aren''t set up for this league'; end if;
  if k.unsigned_swept_at is not null then raise exception 'The deadline has passed and unsigned players have gone to the draft pool'; end if;
  select starts_at into d from draft_room where league_id = k.league_id and year = k.season;
  if p_at is null then
    if d is null then raise exception 'Set a draft date first'; end if;
    v := d - interval '1 month';
    update kc_settings set setup_until = v, deadline_custom = false, updated_at = now() where league_id = k.league_id;
  else
    if d is not null and p_at >= d then raise exception 'The deadline has to be before the draft'; end if;
    if p_at < now() then raise exception 'Pick a date in the future'; end if;
    v := p_at;
    update kc_settings set setup_until = v, deadline_custom = true, updated_at = now() where league_id = k.league_id;
  end if;
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, 'Contract deadline set: ' || to_char(v at time zone 'Australia/Perth', 'Dy DD Mon YYYY, HH12:MIam') || ' (Perth)');
  return v;
end $$;

-- After the deadline: everyone on a list without a contract is released into the draft pool. Runs once per season,
-- lazily (the contracts pages call it, like kc_settle_matches). Does nothing before the deadline.
create or replace function public.kc_deadline_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare k kc_settings; n int;
begin
  select * into k from kc_settings where league_id = public.current_league() for update;
  if k.league_id is null or k.setup_until is null or now() < k.setup_until or k.unsigned_swept_at is not null then return 0; end if;
  delete from squad s
   where s.league_id = k.league_id
     and not exists (select 1 from kc_contracts c where c.player_id = s.player_id and c.league_id = s.league_id and c.status in ('active', 'pending'));
  get diagnostics n = row_count;
  update kc_contracts set provisional = false, updated_at = now() where league_id = k.league_id and provisional;
  update kc_settings set unsigned_swept_at = now(), updated_at = now() where league_id = k.league_id;
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, 'Contract deadline passed: ' || n || ' unsigned player' || case when n = 1 then '' else 's' end || ' released into the draft pool');
  return n;
end $$;

-- Existing leagues still in setup: deadline = one month before their draft.
update kc_settings k set setup_until = d.starts_at - interval '1 month', updated_at = now()
  from draft_room d
 where d.league_id = k.league_id and d.year = k.season and d.starts_at is not null and not k.deadline_custom
   and k.unsigned_swept_at is null and (k.setup_until is null or now() < k.setup_until);

-- ── Delisting: locked from the deadline to the draft ────────────────────────────────────────────────────────────
create or replace function public.kc_release(cid bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; yrs int; dead int; later int; fee int; y int; d timestamptz;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can delist him'; end if;
  if c.provisional and public.kc_in_setup() then raise exception 'That contract is provisional. Undo it instead (free)'; end if;
  select starts_at into d from draft_room where league_id = k.league_id and year = k.season;
  if not public.is_commish() and k.setup_until is not null and now() >= k.setup_until and (d is null or now() < d) then
    raise exception 'Lists are locked from the contract deadline until the draft. Trade him instead (player for player)';
  end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s agreed to join another club'; end if;
  if exists (select 1 from kc_claims where contract_id = c.id and status = 'pending') then raise exception 'His clause has been paid. Match it or let him go first'; end if;
  if exists (select 1 from kc_auctions where contract_id = c.id and status = 'open') then raise exception 'He''s up for auction. Cancel that first'; end if;
  yrs := greatest(1, c.end_season - greatest(c.start_season, k.season) + 1);
  dead := round(c.salary_k * 0.5);
  later := round(c.salary_k * 0.2);
  fee := case when public.kc_in_setup() then 0 else round(c.salary_k * yrs * k.release_fee_pct / 100.0 * k.fee_kt_per_k) end;
  if fee > 0 and public.kc_bank(c.team_id) < fee then raise exception 'Delisting him costs % KT. You have %', fee, public.kc_bank(c.team_id); end if;
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
  perform public.kc_log(c.player_id, c.team_id, null, 'release', fee, 0, 'Delisted: $' || dead || 'k dead money' || case when yrs > 1 then ', then $' || later || 'k a year to ' || c.end_season else '' end || case when fee > 0 then ', ' || fee || ' KT fee' else '' end);
  return dead;
end $$;

-- ── Release clauses ──────────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.kc_buy(bigint, integer);
create function public.kc_buy(cid bigint, p_years integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; me int := public.my_team_id(); price int; buys int; claim bigint; sal int; chk int; win boolean;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id = me then raise exception 'He''s already yours'; end if;
  if exists (select 1 from kc_claims where contract_id = c.id and status = 'pending') then raise exception 'Someone has already activated his clause'; end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s already signed with another club'; end if;
  if p_years is null or p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  price := public.kc_clause(c.id);
  if price is null then raise exception 'He has no release clause'; end if;
  select count(*) into buys from kc_claims
   where buyer_team = me and status <> 'cancelled' and league_id = public.current_league()
     and created_at >= coalesce(k.window_opened_at, '-infinity'::timestamptz);
  if buys >= k.max_buys then raise exception 'You''ve made your % clause offers this period', k.max_buys; end if;
  if public.kc_bank(me) < price then raise exception 'You need % KT and have %', price, public.kc_bank(me); end if;
  sal := greatest(c.salary_k, round(public.kc_rate(c.player_id) * public.kc_length_factor(p_years))::int);
  win := k.window_open and coalesce(k.window_closes_at > now(), true);
  chk := case when win then k.season else k.season + 1 end;
  if public.kc_salary(me, chk) + sal > k.season_cap_k then
    raise exception 'His $%k salary would take you over the $%k cap in %', sal, k.season_cap_k, chk;
  end if;
  perform public.kc_pay(me, -price, 'Clause paid (held 48h): ' || public.kc_pname(c.player_id));
  insert into kc_claims (contract_id, player_id, buyer_team, seller_team, price_kt, season, expires_at, drop_player, offer_years, offer_salary_k)
  values (c.id, c.player_id, me, c.team_id, price, k.season, now() + interval '48 hours', null, p_years, sal) returning id into claim;
  perform public.kc_log(c.player_id, c.team_id, me, 'clause', price, 0,
    'Clause activated: ' || p_years || ' yr' || case when p_years > 1 then 's' else '' end || ' at $' || sal || 'k. 48 hours to match');
  return claim;
end $$;

-- Match: pay the same KT (burned), the buyer is refunded, and he takes the buyer's terms with you. No clause step-up.
create or replace function public.kc_match(claim_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare cl kc_claims; c kc_contracts; k kc_settings; win boolean; yrs int; sal int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into cl from kc_claims where id = claim_id and status = 'pending' and league_id = public.current_league() for update;
  if cl is null then raise exception 'That clause isn''t waiting on you'; end if;
  if cl.seller_team is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can match'; end if;
  if cl.expires_at < now() then raise exception 'The 48 hours are up'; end if;
  if exists (select 1 from kc_claims where player_id = cl.player_id and status = 'matched' and season = cl.season and league_id = public.current_league()) then
    raise exception 'You''ve already matched for him this season';
  end if;
  if public.kc_bank(cl.seller_team) < cl.price_kt then raise exception 'You need % KT to match and have %', cl.price_kt, public.kc_bank(cl.seller_team); end if;
  select * into c from kc_contracts where id = cl.contract_id for update;
  yrs := coalesce(cl.offer_years, greatest(1, c.end_season - k.season + 1));
  sal := coalesce(cl.offer_salary_k, c.salary_k);
  win := k.window_open and coalesce(k.window_closes_at > now(), true);
  if public.kc_salary(cl.seller_team, case when win then k.season else k.season + 1 end) - c.salary_k + sal > k.season_cap_k then
    raise exception 'Matching would take you over the $%k cap', k.season_cap_k;
  end if;
  perform public.kc_pay(cl.seller_team, -cl.price_kt, 'Matched clause (burned): ' || public.kc_pname(cl.player_id));
  perform public.kc_pay(cl.buyer_team, cl.price_kt, 'Clause refunded, matched: ' || public.kc_pname(cl.player_id));
  if win then
    update kc_contracts set base_k = sal, salary_k = sal, start_season = k.season, end_season = k.season + yrs - 1,
           clause_kt = case when tier in ('standard', 'high') then public.kc_clause_at(player_id, tier, league_id) else null end, updated_at = now()
     where id = c.id;
  else
    update kc_contracts set status = 'voided', updated_at = now()
     where player_id = c.player_id and status = 'pending' and team_id = cl.seller_team and league_id = c.league_id;
    update kc_contracts set end_season = k.season, updated_at = now() where id = c.id;
    insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how, status, home_grown, clause_kt)
    values (c.player_id, cl.seller_team, sal, sal, k.season + 1, k.season + yrs, c.tier, 'match', 'pending', c.home_grown,
            case when c.tier in ('standard', 'high') then public.kc_clause_at(c.player_id, c.tier, c.league_id) else null end);
  end if;
  update kc_claims set status = 'matched' where id = cl.id;
  perform public.kc_log(cl.player_id, cl.buyer_team, cl.seller_team, 'match', cl.price_kt, cl.price_kt,
    'Matched: stays on $' || sal || 'k to ' || (case when win then k.season else k.season + 1 end + yrs - 1));
  return 'matched';
end $$;

-- No match (48 hours up, or his club lets him go): the club gets the KT less the levy, and he signs with the buyer on
-- the offered terms. Window open: he moves now. Otherwise he plays out the season and moves at season's end.
create or replace function public.kc_complete_claim(claim_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare cl kc_claims; c kc_contracts; k kc_settings; levy int; win boolean; yrs int; sal int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into cl from kc_claims where id = claim_id and status = 'pending' and league_id = public.current_league() for update;
  if cl is null then raise exception 'That clause isn''t pending'; end if;
  if cl.expires_at > now() and cl.seller_team is distinct from public.my_team_id() and not public.is_commish() then
    raise exception 'His club has until the 48 hours are up to match';
  end if;
  select * into c from kc_contracts where id = cl.contract_id and status = 'active' for update;
  if c is null or c.team_id <> cl.seller_team then
    perform public.kc_pay(cl.buyer_team, cl.price_kt, 'Clause refunded: ' || public.kc_pname(cl.player_id));
    update kc_claims set status = 'cancelled' where id = cl.id;
    return 'cancelled';
  end if;
  yrs := coalesce(cl.offer_years, greatest(1, c.end_season - k.season + 1));
  sal := coalesce(cl.offer_salary_k, c.salary_k);
  win := k.window_open and coalesce(k.window_closes_at > now(), true);
  levy := cl.price_kt * k.levy_pct / 100;
  perform public.kc_pay(cl.seller_team, cl.price_kt - levy, 'Sold on release clause: ' || public.kc_pname(cl.player_id));
  update kc_contracts set status = 'voided', updated_at = now()
   where player_id = c.player_id and status = 'pending' and team_id = cl.seller_team and league_id = c.league_id;
  if win then
    update kc_contracts set team_id = cl.buyer_team, how = 'clause', home_grown = false, locked_until = null, provisional = false,
           base_k = sal, salary_k = sal, start_season = k.season, end_season = k.season + yrs - 1, tier = 'standard',
           clause_kt = public.kc_clause_at(player_id, 'standard', league_id), updated_at = now()
     where id = c.id;
    update squad set team_id = cl.buyer_team, is_keeper = false, is_rookie_keeper = false, lineup = null,
           acquired_how = 'Release clause', acquired_season = k.season, updated_at = now()
     where player_id = c.player_id and league_id = c.league_id;
    update kc_auctions set status = 'cancelled' where contract_id = c.id and status = 'open';
  else
    update kc_contracts set end_season = k.season, updated_at = now() where id = c.id;
    insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how, status, clause_kt)
    values (c.player_id, cl.buyer_team, sal, sal, k.season + 1, k.season + yrs, 'standard', 'clause', 'pending',
            public.kc_clause_at(c.player_id, 'standard', c.league_id));
    update kc_auctions set status = 'cancelled' where contract_id = c.id and status = 'open';
  end if;
  update kc_claims set status = 'completed' where id = cl.id;
  perform public.kc_log(cl.player_id, cl.seller_team, cl.buyer_team, 'clause', cl.price_kt, levy,
    case when win then 'Moved now' else 'Signed for ' || (k.season + 1) || ', moves at season''s end' end || ': $' || sal || 'k for ' || yrs || ' yr' || case when yrs > 1 then 's' else '' end);
  return 'completed';
end $$;

-- ── Free agents: one week of offers ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_fa_week() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('pending', 'offseason') and new.closes_at is null then new.closes_at := now() + interval '7 days'; end if;
  return new;
end $$;
drop trigger if exists kc_fa_week on public.kc_free_agents;
create trigger kc_fa_week before insert on public.kc_free_agents for each row execute function public.kc_fa_week();

-- His old club can match the best offer until the week ends.
create or replace function public.kc_offer_match_track() returns trigger
language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; top kc_offers;
begin
  select * into f from kc_free_agents where id = new.fa_id for update;
  if f is null or f.kind <> 'pending' or f.status <> 'open' then return new; end if;
  select * into top from kc_offers where fa_id = f.id and status = 'tabled' order by score desc, created_at limit 1;
  if top.id is null then
    update kc_free_agents set match_offer = null, match_by = null, match_score = null where id = f.id;
  else
    update kc_free_agents set match_offer = top.id, match_score = top.score,
           match_by = coalesce(f.closes_at, now() + interval '7 days') where id = f.id;
  end if;
  return new;
end $$;

-- Lazy settling, called by the contracts pages: free agents whose week is up sign with the best offer, and release
-- clauses whose 48 hours are up go through.
create or replace function public.kc_settle_matches() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform set_config('khq.system', '1', true);
  for r in select f.match_offer from kc_free_agents f where f.league_id = public.current_league() and f.status = 'open' and f.kind = 'pending'
           and f.match_by is not null and f.match_by < now() and f.match_offer is not null loop
    perform public.kc_accept_offer(r.match_offer);
    n := n + 1;
  end loop;
  for r in select (select o.id from kc_offers o where o.fa_id = f.id and o.status = 'tabled' order by o.score desc, o.created_at limit 1) oid
             from kc_free_agents f where f.league_id = public.current_league() and f.status = 'open' and f.kind = 'offseason'
              and f.closes_at is not null and f.closes_at < now() loop
    if r.oid is not null then perform public.kc_accept_offer(r.oid); n := n + 1; end if;
  end loop;
  for r in select id from kc_claims where league_id = public.current_league() and status = 'pending' and expires_at < now() loop
    perform public.kc_complete_claim(r.id);
    n := n + 1;
  end loop;
  perform set_config('khq.system', '', true);
  return n;
end $$;

-- Ownership and access.
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('kc_set_deadline', 'kc_deadline_sweep', 'kc_release', 'kc_buy', 'kc_match',
              'kc_complete_claim', 'kc_fa_week', 'kc_offer_match_track', 'kc_settle_matches')
  loop execute format('alter function %s owner to khq_definer', r.sig); end loop;
end $$;
revoke create on schema public from khq_definer;
revoke all on function public.kc_fa_week(), public.kc_settings_ready(), public.draft_room_sets_deadline() from public, anon, authenticated;
revoke all on function public.kc_set_deadline(timestamptz), public.kc_deadline_sweep(), public.kc_buy(bigint, integer) from public, anon;
grant execute on function public.kc_set_deadline(timestamptz), public.kc_deadline_sweep(), public.kc_buy(bigint, integer) to authenticated;
