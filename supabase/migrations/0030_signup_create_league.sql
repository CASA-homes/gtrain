-- Keeper HQ multi-league phases 4 and 5: commish manages coaches, open sign-up, and create_league().
-- Safe on the live G-Train database: nothing existing changes except that a new account no longer needs an invite
-- (it simply has no league until it creates one or is invited). The login form still warns uninvited emails.

-- 1. Commish manages coaches in the current league ----------------------------------------------------------------
create or replace function public.commish_set_member(member_email text, new_team int, make_commish boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  if new_team is not null and not exists (select 1 from teams where id = new_team and league_id = public.current_league()) then
    raise exception 'That club isn''t in this league';
  end if;
  update members set team_id = coalesce(new_team, team_id), is_commish = make_commish
   where league_id = public.current_league() and email = lower(btrim(member_email));
end $$;
grant execute on function public.commish_set_member(text, int, boolean) to authenticated;

create or replace function public.commish_remove_member(member_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  delete from members
   where league_id = public.current_league() and email = lower(btrim(member_email)) and user_id <> auth.uid();
end $$;
grant execute on function public.commish_remove_member(text) to authenticated;

-- 2. Open sign-up: anyone can make an account; invites still decide which leagues they're in --------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (user_id, email, team_id, is_commish, league_id)
  select new.id, lower(new.email), a.team_id, a.is_commish, a.league_id
    from public.allowed_emails a where a.email = lower(new.email)
  on conflict (user_id, league_id) do nothing;
  return new;
end $$;

-- 3. Create a league: the signed-in person becomes its commish -------------------------------------------------------
-- clubs: [{ "name": "...", "coach": "...", "email": "..." }, ...]; my_club: index of the creator's club in that list.
create or replace function public.create_league(league_name text, first_season int, scoring text, preset text, clubs jsonb, my_club int)
returns int language plpgsql security definer set search_path = public as $$
declare
  lid int; base text; s text; n int := 0; i int := 0; c jsonb; tid int; my_tid int; uemail text; code text; k int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if league_name is null or char_length(btrim(league_name)) not between 1 and 40 then raise exception 'Give your league a name (40 characters or fewer)'; end if;
  if jsonb_typeof(clubs) <> 'array' or jsonb_array_length(clubs) not between 2 and 20 then raise exception 'A league needs between 2 and 20 clubs'; end if;
  if my_club is null or my_club < 0 or my_club >= jsonb_array_length(clubs) then raise exception 'Pick your own club'; end if;
  if first_season not between 2026 and 2030 then raise exception 'First season must be between 2026 and 2030'; end if;
  if coalesce(scoring, '') not in ('afl', 'sc') then raise exception 'Unknown scoring'; end if;
  if coalesce(preset, '') not in ('classic', 'dynasty', 'later') then raise exception 'Unknown rule set'; end if;
  if (select count(*) from leagues where created_by = auth.uid()) >= 5 then raise exception 'You can create up to 5 leagues'; end if;

  base := left(trim(both '-' from regexp_replace(lower(btrim(league_name)), '[^a-z0-9]+', '-', 'g')), 32);
  if char_length(base) < 2 then base := 'league'; end if;
  s := base;
  while exists (select 1 from leagues where slug = s) loop n := n + 1; s := base || '-' || n; end loop;

  insert into leagues (slug, name, created_by, source, season, settings)
  values (s, btrim(league_name), auth.uid(), 'scratch', first_season, jsonb_build_object('preset', preset, 'scoring', scoring))
  returning id into lid;

  select lower(email) into uemail from auth.users where id = auth.uid();
  for c in select value from jsonb_array_elements(clubs) loop
    if char_length(btrim(coalesce(c ->> 'name', ''))) = 0 then raise exception 'Every club needs a name'; end if;
    code := upper(left(regexp_replace(c ->> 'name', '[^A-Za-z0-9]', '', 'g') || 'XXX', 3));
    k := 1;
    while exists (select 1 from teams where league_id = lid and short_code = code) loop k := k + 1; code := left(code, 2) || k; end loop;
    insert into teams (name, coach_name, short_code, joined_season, league_id)
    values (left(btrim(c ->> 'name'), 40), left(coalesce(nullif(btrim(c ->> 'coach'), ''), 'TBC'), 40), code, first_season, lid)
    returning id into tid;
    if i = my_club then my_tid := tid; end if;
    if nullif(lower(btrim(c ->> 'email')), '') is not null and lower(btrim(c ->> 'email')) <> uemail
       and lower(btrim(c ->> 'email')) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
      insert into allowed_emails (email, team_id, is_commish, league_id) values (lower(btrim(c ->> 'email')), tid, false, lid)
      on conflict (league_id, email) do nothing;
    end if;
    i := i + 1;
  end loop;

  insert into allowed_emails (email, team_id, is_commish, league_id) values (uemail, my_tid, true, lid)
  on conflict (league_id, email) do update set team_id = excluded.team_id, is_commish = true;
  insert into members (user_id, email, team_id, is_commish, league_id) values (auth.uid(), uemail, my_tid, true, lid)
  on conflict (user_id, league_id) do update set team_id = excluded.team_id, is_commish = true;
  return lid;
end $$;
revoke all on function public.create_league(text, int, text, text, jsonb, int) from public;
grant execute on function public.create_league(text, int, text, text, jsonb, int) to authenticated;

-- 4. AFL players are shared by every league: anyone signed in can read them (league setup matches names before the
--    person is in any league). Writes stay commish-only.
drop policy if exists "players: signed-in read" on public.players;
create policy "players: signed-in read" on public.players for select to authenticated using (true);
