-- Keeper HQ multi-league, part 2: close the last gaps between leagues. Safe on the live G-Train database.
--
-- 1. Server functions respect the league scope.
--    The draft room, Cup, challenges, trade desk, tokens, mini games and club settings functions run with elevated
--    rights so they can do things coaches can't do directly. They were owned by `postgres`, which skips row security,
--    so they could reach rows in any league if handed another league's id. They now run as `khq_definer`, a role
--    that gets full access through its own policy but is still bound by the restrictive "league scope" policy, so
--    every one of them only sees and changes the current league's rows. No function bodies change.
--    The membership helpers, sign-up and invite functions stay on `postgres`: they look across leagues on purpose.
--
-- 2. Season-only keys become league keys.
--    The (league_id, …) unique keys added in 0027 become the primary keys; the old season-only keys go. The app
--    already writes with the new keys.

-- 1. A role for elevated functions that still obeys the league scope ---------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'khq_definer') then
    create role khq_definer nologin inherit;
  end if;
end $$;
grant authenticated to khq_definer;            -- auth.uid() and the normal grants
grant khq_definer to postgres;                 -- so postgres can hand functions to it
grant usage on schema public to khq_definer;
grant select, insert, update, delete on all tables in schema public to khq_definer;
grant usage, select on all sequences in schema public to khq_definer;
alter default privileges in schema public grant select, insert, update, delete on tables to khq_definer;
alter default privileges in schema public grant usage, select on sequences to khq_definer;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists "definer access" on public.%I', t);
    execute format('create policy "definer access" on public.%I for all to khq_definer using (true) with check (true)', t);
  end loop;
end $$;

grant create on schema public to khq_definer;   -- needed only while taking ownership; revoked below
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname not in ('is_member', 'is_commish', 'my_team_id', 'current_league', 'league_name', 'my_leagues',
                             'claim_invites', 'handle_new_user', 'email_is_allowed')
  loop
    execute format('alter function %s owner to khq_definer', f.sig);
  end loop;
end $$;
revoke create on schema public from khq_definer;

-- 2. League keys --------------------------------------------------------------------------------------------------
alter table public.draft_room drop constraint if exists draft_room_pkey;
alter table public.draft_room add constraint draft_room_pkey primary key using index draft_room_league_year_key;

alter table public.cup_settings drop constraint if exists cup_settings_pkey;
alter table public.cup_settings add constraint cup_settings_pkey primary key using index cup_settings_league_key;

alter table public.comp_settings drop constraint if exists comp_settings_pkey;
alter table public.comp_settings add constraint comp_settings_pkey primary key using index comp_settings_league_key;

alter table public.msd_state drop constraint if exists msd_state_pkey;
alter table public.msd_state add constraint msd_state_pkey primary key using index msd_state_league_key;

alter table public.cup_results drop constraint if exists cup_results_pkey;
alter table public.cup_results add constraint cup_results_pkey primary key using index cup_results_league_key;

alter table public.msd_drops drop constraint if exists msd_drops_pkey;
alter table public.msd_drops add constraint msd_drops_pkey primary key using index msd_drops_league_key;

alter table public.msd_selections drop constraint if exists msd_selections_pkey;
alter table public.msd_selections add constraint msd_selections_pkey primary key using index msd_selections_league_pick;
alter table public.msd_selections drop constraint if exists msd_selections_season_player_id_key;

alter table public.squad drop constraint if exists squad_pkey;
alter table public.squad add constraint squad_pkey primary key using index squad_league_player_key;

alter table public.watchlist drop constraint if exists watchlist_pkey;
alter table public.watchlist add constraint watchlist_pkey primary key using index watchlist_league_key;

alter table public.mock_edits drop constraint if exists mock_edits_pkey;
alter table public.mock_edits add constraint mock_edits_pkey primary key using index mock_edits_league_key;

-- seasons is referenced by ladder, so swap the reference over with it.
alter table public.ladder drop constraint if exists ladder_season_fkey;
alter table public.seasons drop constraint if exists seasons_pkey;
alter table public.seasons add constraint seasons_pkey primary key using index seasons_league_year_key;
alter table public.ladder add constraint ladder_season_fkey foreign key (league_id, season) references public.seasons (league_id, year) on delete cascade;
