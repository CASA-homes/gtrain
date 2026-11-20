-- create_league v2: every rule comes in one jsonb (clubs, rounds, keepers, list_size, lineup, start_kt, keeper_cap,
-- season_cap, deficit_max, home_grown_pct, draft_r1..draft_rest, rookie_pct). Missing keys use the standard keeper rules.
drop function if exists public.create_league(text, text, text, int, int, int, int, int);

create or replace function public.create_league(p_name text, p_club text, p_coach text, p_rules jsonb default '{}') returns json language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); em text; lid int; code text; slug text; tid int; t_ids int[] := '{}';
  n int := greatest(4, least(coalesce((p_rules ->> 'clubs')::int, 10), 16));
  rounds int := greatest(4, least(coalesce((p_rules ->> 'rounds')::int, 16), 40));
  lu jsonb := coalesce(p_rules -> 'lineup', '{"DEF":5,"MID":7,"RUC":1,"FWD":5}');
  base kc_settings; i int; r int; nm text; sc text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Give your league a name'; end if;
  if char_length(trim(coalesce(p_club, ''))) < 2 then raise exception 'Name your club'; end if;
  if (select count(*) from leagues where created_by = me) >= 3 then raise exception 'You can start up to 3 leagues'; end if;
  em := coalesce(auth.jwt() ->> 'email', '');

  -- Invite code: first letters of the name + 4 random characters (no look-alikes).
  loop
    code := upper(left(regexp_replace(p_name, '[^A-Za-z]', '', 'g') || 'LEAG', 5)) || '-' ||
            (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from leagues where upper(join_code) = code);
  end loop;
  slug := lower(regexp_replace(trim(p_name), '[^A-Za-z0-9]+', '-', 'g')) || '-' || lower(right(code, 4));

  insert into leagues (slug, name, created_by, season, join_code, settings)
  values (slug, left(trim(p_name), 60), me, 2027, code,
          jsonb_build_object('founded', 2027, 'platform', 'Keeper HQ', 'scoring', 'AFL Fantasy',
                             'rounds', rounds, 'clubs', n))
  returning id into lid;
  -- Every table is scoped to the request's league (restrictive RLS), so point this transaction at the new league.
  perform set_config('request.headers', json_build_object('x-league-id', lid::text)::text, true);

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

  -- Contract rules: the standard keeper rules (G-Train's economics), with this league's choices on top.
  insert into kc_settings (league_id, season, shadow, keeper_cap_k, season_cap_k, tax_line_k, tax_kt_per_k, start_kt, max_years,
    long_deal_limit, floor_def, floor_mid, floor_ruc, floor_fwd, clause_std, clause_high, kt_per_k, high_pct, none_pct, home_grown_pct,
    levy_pct, max_buys, pot_dollars, deficit_max_k, hold_back_k, deposit_pct, loan_max_pct, clause_std_pct, clause_high_pct,
    deficit_fee_kt, release_fee_pct, ext_premium_pct, ext_fee_kt, fee_kt_per_k, setup_until,
    keepers, list_size, lineup, draft_r1_k, draft_r2_k, draft_r3_k, draft_r4_k, draft_rest_k, rookie_pct)
  values (lid, 2027, true,
    greatest(300, least(coalesce((p_rules ->> 'keeper_cap')::int, 925), 3000)),
    greatest(greatest(300, least(coalesce((p_rules ->> 'keeper_cap')::int, 925), 3000)), least(coalesce((p_rules ->> 'season_cap')::int, 1150), 4000)),
    0, 0, greatest(0, least(coalesce((p_rules ->> 'start_kt')::int, 1000), 100000)), 5,
    33, 8, 10, 2, 8, 3, 5, 100, 10, 25, greatest(0, least(coalesce((p_rules ->> 'home_grown_pct')::int, 20), 60)),
    10, 2, 1000, greatest(0, least(coalesce((p_rules ->> 'deficit_max')::int, 20), 200)), 12, 10, 25, 25, 50,
    250, 10, 10, 50, 5, '2027-02-17 15:59:59+00',
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

  -- Starting banks.
  insert into kc_ledger (team_id, delta, reason, league_id) select t, base.start_kt, '2027 starting bank', lid from unnest(t_ids) t;

  -- Draft picks: 2027 in snake order (last round optional), 2028 unordered.
  for r in 1 .. rounds loop
    for i in 1 .. n loop
      insert into picks (year, round, overall, original_team_id, owner_team_id, is_optional, kind, league_id)
      values (2027, r, (r - 1) * n + i, t_ids[case when r % 2 = 1 then i else n - i + 1 end], t_ids[case when r % 2 = 1 then i else n - i + 1 end], r = rounds, 'draft', lid);
      insert into picks (year, round, original_team_id, owner_team_id, is_optional, kind, league_id)
      values (2028, r, t_ids[i], t_ids[i], r = rounds, 'draft', lid);
    end loop;
  end loop;

  return json_build_object('league_id', lid, 'join_code', code, 'team_id', t_ids[1]);
end $$;

revoke execute on function public.create_league(text, text, text, jsonb) from public, anon;
grant execute on function public.create_league(text, text, text, jsonb) to authenticated;
grant create on schema public to khq_definer;
alter function public.create_league(text, text, text, jsonb) owner to khq_definer;
revoke create on schema public from khq_definer;
