-- Keeper HQ multi-league foundation. Additive and safe to run on the live G-Train database: G-Train becomes league 1
-- and everything keeps working exactly as before.
--
-- How it works
--  * leagues: one row per league. G-Train is id 1.
--  * Every league-scoped table gets league_id (existing rows = 1). New rows fill it in automatically from the
--    request's league (current_league()), so existing inserts don't need changing.
--  * current_league(): the league the request is for, from the x-league-id header the app sends (defaults to 1).
--  * is_member() / is_commish() / my_team_id() now answer for the current league, so every existing policy and RPC
--    that uses them becomes league-aware without being rewritten.
--  * A restrictive "league scope" policy on every league table means a request only ever sees and writes rows from
--    its own league, on top of the existing policies.
--  * members, allowed_emails and teams keys now include league_id, so one person can coach in several leagues and two
--    leagues can both have a club called "Bodega Boys".
--  * New (league_id, …) unique keys sit alongside the old season-only keys. The old ones are dropped in a later
--    migration, once the app writes with the new keys and before a second league stores data in those tables.
--
-- Run 0024_draft_signoff.sql first if you haven't (it creates two tables this migration needs to cover).
-- 0026_league_name.sql is no longer needed: the league name now lives on leagues.

-- 1. Leagues ---------------------------------------------------------------------------------------------------------
create table if not exists public.leagues (
  id          serial primary key,
  slug        text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  source      text,                                  -- e.g. 'keeper:288126', 'sheet', 'scratch'
  season      int not null default 2027,
  settings    jsonb not null default '{}'::jsonb
);
insert into public.leagues (id, slug, name, source, season)
values (1, 'g-train', 'G-Train', 'keeper:288126', 2027)
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.leagues', 'id'), greatest((select max(id) from public.leagues), 1));

-- 2. Which league is this request for? ------------------------------------------------------------------------------
create or replace function public.current_league()
returns int language sql stable as $$
  select coalesce(
    (select (h ->> 'x-league-id')::int
       from (select nullif(current_setting('request.headers', true), '')::json as h) x
      where (h ->> 'x-league-id') ~ '^[0-9]{1,9}$'),
    1)
$$;

-- 3. league_id on every league table, plus the league scope policy ---------------------------------------------------
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public'
       and tablename not in ('leagues', 'players', 'player_seasons')   -- AFL data is shared by every league
  loop
    execute format('alter table public.%I add column if not exists league_id int not null default 1 references public.leagues(id) on delete cascade', t);
    execute format('alter table public.%I alter column league_id set default public.current_league()', t);
    execute format('create index if not exists %I on public.%I (league_id)', t || '_league_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "league scope" on public.%I', t);
    execute format('create policy "league scope" on public.%I as restrictive for all using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()))', t);
  end loop;
end $$;

-- 4. Keys that must include the league -----------------------------------------------------------------------------
-- members: one row per person per league
alter table public.members drop constraint if exists members_pkey;
alter table public.members add primary key (user_id, league_id);
alter table public.members drop constraint if exists members_email_key;
create unique index if not exists members_league_email_key on public.members (league_id, email);
-- invites: an email can be invited to several leagues
alter table public.allowed_emails drop constraint if exists allowed_emails_pkey;
alter table public.allowed_emails add primary key (league_id, email);
-- club names are unique within a league, not across Keeper HQ
alter table public.teams drop constraint if exists teams_name_key;
create unique index if not exists teams_league_name_key on public.teams (league_id, name);
alter table public.teams drop constraint if exists teams_keeper_id_key;
create unique index if not exists teams_league_keeper_id_key on public.teams (league_id, keeper_id);

-- New league-aware unique keys beside the old season-only ones (old ones dropped in a later migration).
create unique index if not exists draft_room_league_year_key   on public.draft_room (league_id, year);
create unique index if not exists cup_settings_league_key      on public.cup_settings (league_id, season);
create unique index if not exists comp_settings_league_key     on public.comp_settings (league_id, season);
create unique index if not exists msd_state_league_key         on public.msd_state (league_id, season);
create unique index if not exists seasons_league_year_key      on public.seasons (league_id, year);
create unique index if not exists cup_results_league_key       on public.cup_results (league_id, season, match_id);
create unique index if not exists msd_drops_league_key         on public.msd_drops (league_id, season, player_id);
create unique index if not exists msd_selections_league_pick   on public.msd_selections (league_id, season, pick_id);
create unique index if not exists msd_selections_league_player on public.msd_selections (league_id, season, player_id);
create unique index if not exists squad_league_player_key      on public.squad (league_id, player_id);
create unique index if not exists watchlist_league_key         on public.watchlist (league_id, user_id, player_id);
create unique index if not exists mock_edits_league_key        on public.mock_edits (league_id, user_id, player_key);

-- 5. Membership helpers answer for the current league --------------------------------------------------------------
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid() and league_id = public.current_league())
$$;
create or replace function public.is_commish()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_commish from public.members where user_id = auth.uid() and league_id = public.current_league()), false)
$$;
create or replace function public.my_team_id()
returns int language sql stable security definer set search_path = public as $$
  select team_id from public.members where user_id = auth.uid() and league_id = public.current_league()
$$;

-- 6. Leagues: who can see and rename them ---------------------------------------------------------------------------
alter table public.leagues enable row level security;
drop policy if exists "leagues: members read" on public.leagues;
create policy "leagues: members read" on public.leagues for select
  using (exists (select 1 from public.members m where m.user_id = (select auth.uid()) and m.league_id = leagues.id));
drop policy if exists "leagues: commish edits" on public.leagues;
create policy "leagues: commish edits" on public.leagues for update
  using (id = (select public.current_league()) and (select public.is_commish()))
  with check (id = (select public.current_league()) and (select public.is_commish()));

-- The current league's name, readable before sign-in (sign-in page).
create or replace function public.league_name()
returns text language sql stable security definer set search_path = public as $$
  select name from public.leagues where id = public.current_league()
$$;
grant execute on function public.league_name() to anon, authenticated;

-- Every league the signed-in person belongs to (league switcher).
create or replace function public.my_leagues()
returns table (id int, slug text, name text, team_id int, is_commish boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.slug, l.name, m.team_id, m.is_commish
    from public.members m join public.leagues l on l.id = m.league_id
   where m.user_id = auth.uid()
   order by l.id
$$;
grant execute on function public.my_leagues() to authenticated;

-- 7. Sign-up and invites across leagues ----------------------------------------------------------------------------
-- New account: join every league that has invited this email. Still invite-only until league sign-up opens.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'This email hasn''t been invited to a league yet';
  end if;
  insert into public.members (user_id, email, team_id, is_commish, league_id)
  select new.id, lower(new.email), a.team_id, a.is_commish, a.league_id
    from public.allowed_emails a where a.email = lower(new.email)
  on conflict (user_id, league_id) do nothing;
  return new;
end $$;

-- Existing account invited to another league later: picks up the new membership on next sign-in.
create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.members (user_id, email, team_id, is_commish, league_id)
  select auth.uid(), a.email, a.team_id, a.is_commish, a.league_id
    from public.allowed_emails a
   where a.email = lower((select email from auth.users where id = auth.uid()))
  on conflict (user_id, league_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.claim_invites() from public;
grant execute on function public.claim_invites() to authenticated;
