-- 0083: replaces 0081 (don't run 0081). Contracts open straight away for new leagues, and every league's contract
-- deadline (setup_until) is its own draft day.
--   • New leagues are ready for contracts the moment they're made: every player unsigned, coaches sign their own keepers
--     (home-grown discount, provisional until the deadline). No commish "Set up contracts" step.
--   • The deadline is the moment the league's draft starts, and it follows the draft date if the commish moves it,
--     but only while setup is still open (it never reopens setup once contracts are formal).
--   • create_league takes the draft date from the setup wizard (p_rules.draft_at).
-- Starting banks: create_league already pays them, so nothing here pays a bank (0081 would have paid them twice).

-- 1. New contract settings: ready straight away, deadline = the league's draft start if it has one.
create or replace function public.kc_settings_ready() returns trigger
language plpgsql security definer set search_path = public as $$
declare d timestamptz;
begin
  new.seeded_at := coalesce(new.seeded_at, now());
  select starts_at into d from draft_room where league_id = new.league_id and year = new.season;
  if d is not null then new.setup_until := d; end if;
  return new;
end $$;

drop trigger if exists kc_settings_ready on public.kc_settings;
create trigger kc_settings_ready before insert on public.kc_settings
  for each row execute function public.kc_settings_ready();

-- 2. Moving the draft moves the contract deadline (while setup is still open).
create or replace function public.draft_room_sets_deadline() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.starts_at is null then return new; end if;
  update kc_settings set setup_until = new.starts_at, updated_at = now()
   where league_id = new.league_id and season = new.year
     and setup_until is distinct from new.starts_at
     and (setup_until is null or now() < setup_until);
  return new;
end $$;

drop trigger if exists draft_room_sets_deadline on public.draft_room;
create trigger draft_room_sets_deadline after insert or update of starts_at on public.draft_room
  for each row execute function public.draft_room_sets_deadline();

revoke all on function public.kc_settings_ready(), public.draft_room_sets_deadline() from public, anon, authenticated;

-- 3. create_league: same as before, plus the draft date from the wizard.
create or replace function public.create_league(p_name text, p_club text, p_coach text, p_rules jsonb default '{}'::jsonb)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  me uuid := auth.uid(); em text; lid int; code text; slug text; tid int; t_ids int[] := '{}';
  n int := greatest(4, least(coalesce((p_rules ->> 'clubs')::int, 10), 16));
  rounds int := greatest(4, least(coalesce((p_rules ->> 'rounds')::int, 16), 40));
  lu jsonb := coalesce(p_rules -> 'lineup', '{"DEF":5,"MID":7,"RUC":1,"FWD":5}');
  draft_at timestamptz := nullif(p_rules ->> 'draft_at', '')::timestamptz;
  base kc_settings; i int; r int; nm text; sc text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Give your league a name'; end if;
  if char_length(trim(coalesce(p_club, ''))) < 2 then raise exception 'Name your club'; end if;
  if (select count(*) from leagues where created_by = me) >= 3 then raise exception 'You can start up to 3 leagues'; end if;
  em := coalesce(auth.jwt() ->> 'email', '');

  loop
    code := upper(left(regexp_replace(p_name, '[^A-Za-z]', '', 'g') || 'LEAG', 5)) || '-' ||
            (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from leagues where upper(join_code) = code);
  end loop;
  slug := lower(regexp_replace(trim(p_name), '[^A-Za-z0-9]+', '-', 'g')) || '-' || lower(right(code, 4));

  insert into leagues (slug, name, created_by, season, join_code, settings)
  values (slug, left(trim(p_name), 60), me, 2027, code,
          jsonb_build_object('founded', 2027, 'platform', 'Keeper HQ', 'scoring', 'AFL Fantasy', 'rounds', rounds, 'clubs', n))
  returning id into lid;
  perform set_config('request.headers', json_build_object('x-league-id', lid::text)::text, true);

  -- The draft room is made by the leagues trigger; give it the wizard's draft date.
  insert into draft_room (league_id, year) values (lid, 2027) on conflict (league_id, year) do nothing;
  if draft_at is not null then
    update draft_room set starts_at = draft_at, updated_at = now() where league_id = lid and year = 2027;
  end if;

  for i in 1 .. n loop
    nm := case when i = 1 then left(trim(p_club), 40) else 'Club ' || i end;
    sc := upper(left(regexp_replace(nm, '[^A-Za-z0-9]', '', 'g'), 3));
    if exists (select 1 from teams where league_id = lid and short_code = sc) or char_length(sc) < 2 then sc := 'C' || i; end if;
    insert into teams (name, coach_name, short_code, joined_season, league_id)
    values (nm, case when i = 1 then coalesce(nullif(left(trim(p_coach), 40), ''), 'Commish') else 'Open' end, sc, 2027, lid)
    returning id into tid;
    t_ids := t_ids || tid;
  end loop;

  insert into members (user_id, email, team_id, is_commish, display_name, league_id)
  values (me, coalesce(em, ''), t_ids[1], true, nullif(left(trim(p_coach), 40), ''), lid);

  insert into kc_settings (league_id, season, shadow, keeper_cap_k, season_cap_k, tax_line_k, tax_kt_per_k, start_kt, max_years,
    long_deal_limit, floor_def, floor_mid, floor_ruc, floor_fwd, clause_std, clause_high, kt_per_k, high_pct, none_pct, home_grown_pct,
    levy_pct, max_buys, pot_dollars, deficit_max_k, hold_back_k, deposit_pct, loan_max_pct, clause_std_pct, clause_high_pct,
    deficit_fee_kt, release_fee_pct, ext_premium_pct, ext_fee_kt, fee_kt_per_k, setup_until,
    keepers, list_size, lineup, draft_r1_k, draft_r2_k, draft_r3_k, draft_r4_k, draft_rest_k, rookie_pct)
  values (lid, 2027, true,
    greatest(300, least(coalesce((p_rules ->> 'keeper_cap')::int, 925), 3000)),
    greatest(greatest(300, least(coalesce((p_rules ->> 'keeper_cap')::int, 925), 3000)), least(coalesce((p_rules ->> 'season_cap')::int, 1150), 4000)),
    1000, 0, greatest(0, least(coalesce((p_rules ->> 'start_kt')::int, 1000), 100000)), 5,
    33, 8, 10, 2, 8, 3, 5, 100, 10, 25, greatest(0, least(coalesce((p_rules ->> 'home_grown_pct')::int, 20), 60)),
    10, 2, 1000, greatest(0, least(coalesce((p_rules ->> 'deficit_max')::int, 20), 200)), 12, 10, 25, 25, 50,
    250, 10, 10, 50, 5, coalesce(draft_at, '2027-02-17 15:59:59+00'),
    greatest(6, least(coalesce((p_rules ->> 'keepers')::int, 18), 30)),
    greatest(greatest(6, least(coalesce((p_rules ->> 'keepers')::int, 18), 30)) + 4, least(coalesce((p_rules ->> 'list_size')::int, 33), 50)),
    jsonb_build_object(
      'DEF', greatest(1, least(coalesce((lu ->> 'DEF')::int, 5), 10)), 'MID', greatest(1, least(coalesce((lu ->> 'MID')::int, 7), 12)),
      'RUC', greatest(1, least(coalesce((lu ->> 'RUC')::int, 1), 3)), 'FWD', greatest(1, least(coalesce((lu ->> 'FWD')::int, 5), 10))),
    greatest(1, least(coalesce((p_rules ->> 'draft_r1')::int, 30), 200)), greatest(1, least(coalesce((p_rules ->> 'draft_r2')::int, 25), 200)),
    greatest(1, least(coalesce((p_rules ->> 'draft_r3')::int, 20), 200)), greatest(1, least(coalesce((p_rules ->> 'draft_r4')::int, 15), 200)),
    greatest(1, least(coalesce((p_rules ->> 'draft_rest')::int, 10), 200)), greatest(10, least(coalesce((p_rules ->> 'rookie_pct')::int, 50), 100)))
  returning * into base;
  update kc_settings set tax_line_k = keeper_cap_k + (season_cap_k - keeper_cap_k) / 2 where league_id = lid;

  insert into kc_ledger (team_id, delta, reason, league_id) select t, base.start_kt, '2027 starting bank', lid from unnest(t_ids) t;

  for r in 1 .. rounds loop
    for i in 1 .. n loop
      insert into picks (year, round, overall, original_team_id, owner_team_id, is_optional, kind, league_id)
      values (2027, r, (r - 1) * n + i, t_ids[case when r % 2 = 1 then i else n - i + 1 end], t_ids[case when r % 2 = 1 then i else n - i + 1 end], r = rounds, 'draft', lid);
      insert into picks (year, round, original_team_id, owner_team_id, is_optional, kind, league_id)
      values (2028, r, t_ids[i], t_ids[i], r = rounds, 'draft', lid);
    end loop;
  end loop;

  return json_build_object('league_id', lid, 'join_code', code, 'team_id', t_ids[1]);
end $function$;

-- 4. Existing leagues.
-- Open contracts for leagues stuck at "Set up contracts" (never set up, no contracts yet). Their banks are already paid.
do $$ declare l record; begin
  for l in select k.league_id from kc_settings k
            where k.seeded_at is null and not exists (select 1 from kc_contracts c where c.league_id = k.league_id) loop
    update kc_settings set seeded_at = now(), updated_at = now() where league_id = l.league_id;
    insert into kc_transfers (league_id, player_id, from_team, to_team, kind, fee_kt, levy_kt, note)
    values (l.league_id, null, null, null, 'seed', 0, 0, 'Contracts are open: every player is unsigned. Sign your keepers before the draft.');
  end loop;
end $$;

-- Deadline = draft start, for every league still in setup.
update kc_settings k set setup_until = d.starts_at, updated_at = now()
  from draft_room d
 where d.league_id = k.league_id and d.year = k.season and d.starts_at is not null
   and k.setup_until is distinct from d.starts_at
   and (k.setup_until is null or now() < k.setup_until);
