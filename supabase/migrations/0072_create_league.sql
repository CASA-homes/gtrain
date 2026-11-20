-- Anyone signed in can start a league: league row, invite code, their club plus placeholder clubs, commish
-- membership, contract settings (copied from the standard keeper rules, with the founder's caps), starting KT banks,
-- and 2027/2028 draft picks. Everything else in the app builds itself as the league plays.

create or replace function public.create_league(
  p_name text, p_club text, p_coach text, p_clubs int,
  p_keeper_cap int default 925, p_season_cap int default 1150, p_keepers int default 18, p_rounds int default 16
) returns json language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); em text; lid int; code text; slug text; tid int; t_ids int[] := '{}';
  n int := greatest(4, least(coalesce(p_clubs, 10), 16));
  rounds int := greatest(4, least(coalesce(p_rounds, 16), 40));
  base kc_settings; i int; r int; nm text; sc text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Give your league a name'; end if;
  if char_length(trim(coalesce(p_club, ''))) < 2 then raise exception 'Name your club'; end if;
  if (select count(*) from leagues where created_by = me) >= 3 then raise exception 'You can start up to 3 leagues'; end if;
  em := coalesce(auth.jwt() ->> 'email', '');
  select * into base from kc_settings where league_id = 1;  -- the standard rules (read before switching league scope)

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
                             'keepers', greatest(10, least(coalesce(p_keepers, 18), 30)), 'rounds', rounds, 'clubs', n))
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

  -- Contract rules: the standard keeper settings, with this league's caps.
  base.league_id := lid; base.keeper_cap_k := greatest(500, least(coalesce(p_keeper_cap, 925), 2000));
  base.season_cap_k := greatest(base.keeper_cap_k, least(coalesce(p_season_cap, 1150), 2500));
  base.tax_line_k := base.keeper_cap_k + (base.season_cap_k - base.keeper_cap_k) / 2;
  base.window_open := false; base.window_kind := null; base.window_opened_at := null; base.window_closes_at := null;
  base.seeded_at := null; base.updated_at := now(); base.midseason_at := null; base.rookie_lock_at := null; base.fa_day := null;
  if base.season is null then  -- couldn't read the standard row: fall back to the table defaults
    insert into kc_settings (league_id, keeper_cap_k, season_cap_k, tax_line_k, start_kt)
    values (lid, base.keeper_cap_k, base.season_cap_k, base.tax_line_k, 1000) returning * into base;
  else
    insert into kc_settings select (base).*;
  end if;

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

-- The founder renames placeholder clubs during setup (before anyone else joins).
create or replace function public.rename_clubs(p_league int, p_names text[]) returns void language plpgsql security definer set search_path = public as $$
declare t record; i int := 0;
begin
  if not exists (select 1 from members where user_id = auth.uid() and league_id = p_league and is_commish) then raise exception 'Only the commish can rename clubs'; end if;
  perform set_config('request.headers', json_build_object('x-league-id', p_league::text)::text, true);
  for t in select id from teams where league_id = p_league order by id loop
    i := i + 1;
    if i <= coalesce(array_length(p_names, 1), 0) and char_length(trim(coalesce(p_names[i], ''))) >= 2 then
      update teams set name = left(trim(p_names[i]), 40),
        short_code = coalesce((select s from (select upper(left(regexp_replace(trim(p_names[i]), '[^A-Za-z0-9]', '', 'g'), 3)) s) x
                               where char_length(s) >= 2 and not exists (select 1 from teams o where o.league_id = p_league and o.short_code = x.s and o.id <> t.id)), short_code)
      where id = t.id;
    end if;
  end loop;
end $$;

revoke execute on function public.create_league(text, text, text, int, int, int, int, int) from public, anon;
revoke execute on function public.rename_clubs(int, text[]) from public, anon;
grant execute on function public.create_league(text, text, text, int, int, int, int, int), public.rename_clubs(int, text[]) to authenticated;
grant create on schema public to khq_definer;
alter function public.create_league(text, text, text, int, int, int, int, int) owner to khq_definer;
alter function public.rename_clubs(int, text[]) owner to khq_definer;
revoke create on schema public from khq_definer;
