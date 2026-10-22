-- Trade desk: multi-team trades.
-- A coach opens a desk saying what he wants. Any coach can join and put assets on the table (players or picks
-- moving from one team to another). Every team that sends or receives something must accept. Any change to the
-- deal clears all acceptances. Once everyone has accepted, the desk is "agreed" and goes to the commish, who
-- executes it in one transaction (everything moves, or nothing does). 6 lopsided votes from teams outside the
-- deal flags it, same as the charter rule for normal trades.

create table public.desks (
  id          uuid primary key default gen_random_uuid(),
  team_id     int not null references public.teams(id),          -- who opened it
  title       text not null check (char_length(title) between 3 and 140),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'agreed', 'done', 'vetoed', 'closed')),
  created_by  uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

create table public.desk_teams (
  desk_id     uuid not null references public.desks(id) on delete cascade,
  team_id     int not null references public.teams(id),
  accepted    boolean not null default false,
  accepted_at timestamptz,
  joined_at   timestamptz not null default now(),
  primary key (desk_id, team_id)
);

create table public.desk_items (
  id            uuid primary key default gen_random_uuid(),
  desk_id       uuid not null references public.desks(id) on delete cascade,
  from_team_id  int not null references public.teams(id),
  to_team_id    int not null references public.teams(id),
  player_id     int references public.players(id),
  pick_id       int references public.picks(id),
  added_by_team int not null references public.teams(id),
  created_at    timestamptz not null default now(),
  check (from_team_id <> to_team_id),
  check ((player_id is null) <> (pick_id is null))
);
create unique index desk_items_player on public.desk_items (desk_id, player_id) where player_id is not null;
create unique index desk_items_pick on public.desk_items (desk_id, pick_id) where pick_id is not null;

create table public.desk_comments (
  id          uuid primary key default gen_random_uuid(),
  desk_id     uuid not null references public.desks(id) on delete cascade,
  team_id     int not null references public.teams(id),
  body        text not null check (char_length(body) between 1 and 1000),
  created_by  uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.desk_votes (
  desk_id  uuid not null references public.desks(id) on delete cascade,
  team_id  int not null references public.teams(id),
  primary key (desk_id, team_id)
);

-- ---------------------------------------------------------------- triggers

-- The opener is the first participant.
create or replace function public.desk_add_opener() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.desk_teams (desk_id, team_id) values (new.id, new.team_id) on conflict do nothing;
  return new;
end $$;
create trigger desk_add_opener after insert on public.desks for each row execute function public.desk_add_opener();

-- Items: desk must be open, the sender must own the asset, both teams become participants, acceptances reset.
create or replace function public.desk_item_check() returns trigger language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from public.desks where id = new.desk_id;
  if st <> 'open' then raise exception 'This desk is no longer open'; end if;
  if new.player_id is not null and not exists (select 1 from public.squad where player_id = new.player_id and team_id = new.from_team_id) then
    raise exception 'That player isn’t on the sending team’s list';
  end if;
  if new.pick_id is not null and not exists (select 1 from public.picks where id = new.pick_id and owner_team_id = new.from_team_id) then
    raise exception 'The sending team doesn’t own that pick';
  end if;
  insert into public.desk_teams (desk_id, team_id) values (new.desk_id, new.from_team_id), (new.desk_id, new.to_team_id) on conflict do nothing;
  return new;
end $$;
create trigger desk_item_check before insert on public.desk_items for each row execute function public.desk_item_check();

create or replace function public.desk_reset_accepts() returns trigger language plpgsql security definer set search_path = public as $$
declare d uuid := coalesce(new.desk_id, old.desk_id);
begin
  update public.desk_teams set accepted = false, accepted_at = null where desk_id = d and accepted;
  update public.desks set status = 'open' where id = d and status = 'agreed';
  return null;
end $$;
create trigger desk_reset_accepts after insert or delete on public.desk_items for each row execute function public.desk_reset_accepts();

-- Removing an item can only happen while the desk is open.
create or replace function public.desk_item_delete_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select status from public.desks where id = old.desk_id) not in ('open', 'agreed') then raise exception 'This desk is closed'; end if;
  return old;
end $$;
create trigger desk_item_delete_check before delete on public.desk_items for each row execute function public.desk_item_delete_check();

-- When every team that sends or receives something has accepted, the desk is agreed. Un-accepting reopens it.
create or replace function public.desk_check_agreed() returns trigger language plpgsql security definer set search_path = public as $$
declare involved int; agreed int; st text;
begin
  select status into st from public.desks where id = new.desk_id;
  if st not in ('open', 'agreed') then return new; end if;
  select count(distinct t), count(distinct t) filter (where dt.accepted)
    into involved, agreed
    from (select from_team_id t from public.desk_items where desk_id = new.desk_id
          union select to_team_id from public.desk_items where desk_id = new.desk_id) x
    join public.desk_teams dt on dt.desk_id = new.desk_id and dt.team_id = x.t;
  update public.desks set status = case when involved >= 2 and involved = agreed then 'agreed' else 'open' end
   where id = new.desk_id;
  return new;
end $$;
create trigger desk_check_agreed after update of accepted on public.desk_teams for each row execute function public.desk_check_agreed();

-- ---------------------------------------------------------------- commish actions

-- Execute an agreed desk: re-check every asset, then move them all at once.
create or replace function public.execute_desk(p_desk uuid) returns void language plpgsql security definer set search_path = public as $$
declare it record;
begin
  if not public.is_commish() then raise exception 'Only the commissioner can execute a trade'; end if;
  if (select status from public.desks where id = p_desk) <> 'agreed' then raise exception 'Every team has to accept first'; end if;
  for it in select * from public.desk_items where desk_id = p_desk loop
    if it.player_id is not null then
      if not exists (select 1 from public.squad where player_id = it.player_id and team_id = it.from_team_id) then
        raise exception 'A player has changed hands since this deal was agreed';
      end if;
      update public.squad set team_id = it.to_team_id, is_keeper = false, is_rookie_keeper = false, lineup = null,
        acquired_how = 'Trade desk', acquired_season = extract(year from now())::int, updated_at = now()
       where player_id = it.player_id;
      update public.ownership set to_season = extract(year from now())::int where player_id = it.player_id and to_season is null;
      insert into public.ownership (player_id, team_id, from_season, how) values (it.player_id, it.to_team_id, extract(year from now())::int, 'Trade desk');
    else
      if not exists (select 1 from public.picks where id = it.pick_id and owner_team_id = it.from_team_id) then
        raise exception 'A pick has changed hands since this deal was agreed';
      end if;
      update public.picks set owner_team_id = it.to_team_id where id = it.pick_id;
    end if;
  end loop;
  update public.desks set status = 'done', decided_at = now() where id = p_desk;
end $$;
grant execute on function public.execute_desk(uuid) to authenticated;

create or replace function public.veto_desk(p_desk uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Only the commissioner can veto a trade'; end if;
  update public.desks set status = 'vetoed', decided_at = now() where id = p_desk and status in ('open', 'agreed');
end $$;
grant execute on function public.veto_desk(uuid) to authenticated;

-- ---------------------------------------------------------------- access

alter table public.desks enable row level security;
alter table public.desk_teams enable row level security;
alter table public.desk_items enable row level security;
alter table public.desk_comments enable row level security;
alter table public.desk_votes enable row level security;

create policy "members read desks" on public.desks for select to authenticated using (public.is_member());
create policy "open own desk" on public.desks for insert to authenticated with check (team_id = public.my_team_id());
create policy "opener closes desk" on public.desks for update to authenticated
  using (team_id = public.my_team_id() or public.is_commish()) with check (team_id = public.my_team_id() or public.is_commish());

create policy "members read desk teams" on public.desk_teams for select to authenticated using (public.is_member());
create policy "join as own team" on public.desk_teams for insert to authenticated with check (team_id = public.my_team_id());
create policy "accept as own team" on public.desk_teams for update to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());
create policy "leave as own team" on public.desk_teams for delete to authenticated
  using (team_id = public.my_team_id() and not exists (
    select 1 from public.desk_items i where i.desk_id = desk_teams.desk_id and public.my_team_id() in (i.from_team_id, i.to_team_id)));

create policy "members read desk items" on public.desk_items for select to authenticated using (public.is_member());
-- You can put your own assets on the table, or ask for someone else's to come to you.
create policy "add items involving own team" on public.desk_items for insert to authenticated
  with check (added_by_team = public.my_team_id() and public.my_team_id() in (from_team_id, to_team_id));
create policy "remove items involving own team" on public.desk_items for delete to authenticated
  using (public.my_team_id() in (from_team_id, to_team_id, added_by_team));

create policy "members read desk comments" on public.desk_comments for select to authenticated using (public.is_member());
create policy "comment as own team" on public.desk_comments for insert to authenticated with check (team_id = public.my_team_id());

create policy "members read desk votes" on public.desk_votes for select to authenticated using (public.is_member());
create policy "vote as outside team" on public.desk_votes for insert to authenticated
  with check (team_id = public.my_team_id() and not exists (
    select 1 from public.desk_items i where i.desk_id = desk_votes.desk_id and public.my_team_id() in (i.from_team_id, i.to_team_id)));

alter publication supabase_realtime add table public.desk_items, public.desk_teams, public.desk_comments;

-- Removing things from the market: owners already can; the commish can remove any wish too.
drop policy if exists "commish edits wishes" on public.wishes;
create policy "commish edits wishes" on public.wishes for update to authenticated using (public.is_commish());
