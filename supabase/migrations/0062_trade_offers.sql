-- Trade desk as offers and counters. A club puts the board forward (snapshotting it), the other side accepts,
-- declines or edits and puts it forward again (a counter). Clubs can be invited onto a desk by a participant.
create table if not exists public.desk_events (
  id         bigserial primary key,
  desk_id    uuid not null references public.desks(id) on delete cascade,
  team_id    int not null references public.teams(id),
  kind       text not null check (kind in ('proposed', 'countered', 'accepted', 'declined', 'withdrawn')),
  note       text check (char_length(note) <= 500),
  items      jsonb not null default '[]',
  created_at timestamptz not null default now(),
  league_id  int not null default public.current_league()
);
create index if not exists desk_events_desk on public.desk_events (desk_id, created_at);
alter table public.desk_events enable row level security;
create policy "league scope" on public.desk_events using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
create policy "members read desk events" on public.desk_events for select using ((select public.is_member()));
create policy "definer access" on public.desk_events to khq_definer using (true) with check (true);

create or replace function public.desk_is_party(p_desk uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from desk_teams where desk_id = p_desk and team_id = public.my_team_id());
$$;

-- Bring another club onto the desk.
create or replace function public.desk_invite(p_desk uuid, p_team int) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.desk_is_party(p_desk) then raise exception 'Only clubs on this trade can bring others in'; end if;
  if (select status from desks where id = p_desk) not in ('open', 'agreed') then raise exception 'This trade is closed'; end if;
  if not exists (select 1 from teams where id = p_team) then raise exception 'No such club'; end if;
  insert into desk_teams (desk_id, team_id) values (p_desk, p_team) on conflict do nothing;
end $$;

-- Put the board forward: snapshot it, accept it yourself, clear everyone else's acceptance.
create or replace function public.desk_propose(p_desk uuid, p_note text default null) returns text language plpgsql security definer set search_path = public as $$
declare me int := public.my_team_id(); k text; snap jsonb;
begin
  if not public.desk_is_party(p_desk) then raise exception 'You’re not on this trade'; end if;
  if (select status from desks where id = p_desk) not in ('open', 'agreed') then raise exception 'This trade is closed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('from', from_team_id, 'to', to_team_id, 'player', player_id, 'pick', pick_id, 'kt', kt) order by created_at), '[]')
    into snap from desk_items where desk_id = p_desk;
  if jsonb_array_length(snap) = 0 then raise exception 'Put something on the table first'; end if;
  k := case when exists (select 1 from desk_events where desk_id = p_desk and kind in ('proposed', 'countered') and team_id <> me) then 'countered' else 'proposed' end;
  insert into desk_events (desk_id, team_id, kind, note, items) values (p_desk, me, k, nullif(trim(p_note), ''), snap);
  update desk_teams set accepted = false, accepted_at = null where desk_id = p_desk and team_id <> me and accepted;
  update desk_teams set accepted = true, accepted_at = now() where desk_id = p_desk and team_id = me;
  return k;
end $$;

create or replace function public.desk_accept(p_desk uuid) returns void language plpgsql security definer set search_path = public as $$
declare me int := public.my_team_id();
begin
  if not public.desk_is_party(p_desk) then raise exception 'You’re not on this trade'; end if;
  if (select status from desks where id = p_desk) not in ('open', 'agreed') then raise exception 'This trade is closed'; end if;
  update desk_teams set accepted = true, accepted_at = now() where desk_id = p_desk and team_id = me;
  insert into desk_events (desk_id, team_id, kind) values (p_desk, me, 'accepted');
end $$;

-- Decline (or withdraw your own offer): the trade closes.
create or replace function public.desk_decline(p_desk uuid, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare me int := public.my_team_id(); last_by int;
begin
  if not public.desk_is_party(p_desk) and not public.is_commish() then raise exception 'You’re not on this trade'; end if;
  if (select status from desks where id = p_desk) not in ('open', 'agreed') then raise exception 'This trade is closed'; end if;
  select team_id into last_by from desk_events where desk_id = p_desk and kind in ('proposed', 'countered') order by created_at desc limit 1;
  insert into desk_events (desk_id, team_id, kind, note) values (p_desk, me, case when last_by = me then 'withdrawn' else 'declined' end, nullif(trim(p_note), ''));
  update desks set status = 'closed', decided_at = now() where id = p_desk;
end $$;

grant create on schema public to khq_definer;
alter function public.desk_is_party(uuid) owner to khq_definer;
alter function public.desk_invite(uuid, int) owner to khq_definer;
alter function public.desk_propose(uuid, text) owner to khq_definer;
alter function public.desk_accept(uuid) owner to khq_definer;
alter function public.desk_decline(uuid, text) owner to khq_definer;
revoke create on schema public from khq_definer;
revoke execute on function public.desk_invite(uuid, int), public.desk_propose(uuid, text), public.desk_accept(uuid), public.desk_decline(uuid, text), public.desk_is_party(uuid) from anon, public;
grant execute on function public.desk_invite(uuid, int), public.desk_propose(uuid, text), public.desk_accept(uuid), public.desk_decline(uuid, text), public.desk_is_party(uuid) to authenticated;
