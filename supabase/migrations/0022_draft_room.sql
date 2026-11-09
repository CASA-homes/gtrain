-- G-Train Draft Centre + live Draft Room.
-- One row per draft year holds the commish settings and the clock. Picks come from the picks table (kind = 'draft'),
-- in overall order (snake reverses even rounds). A club can only fill its list: list_max minus its keepers
-- (rookie keeper included); its later picks are N/A and the room skips them.
-- Timer runs out: the room takes the top player on that club's queue; no queue, the pick is skipped and the club
-- gets a make-up pick at the end of the draft. A make-up pick that runs out with no queue is forfeited.

create table if not exists public.draft_room (
  year           int primary key,
  status         text not null default 'scheduled' check (status in ('scheduled', 'live', 'paused', 'done')),
  starts_at      timestamptz,
  pick_seconds   int not null default 90 check (pick_seconds between 15 and 1800),
  break_every    int not null default 4 check (break_every between 0 and 16),
  break_minutes  int not null default 5 check (break_minutes between 0 and 60),
  snake          boolean not null default false,
  trading        boolean not null default true,
  list_max       int not null default 33 check (list_max between 20 and 60),
  on_clock_since timestamptz,
  paused_left    int,
  makeups        int[] not null default '{}',
  updated_at     timestamptz not null default now()
);
alter table public.draft_room enable row level security;
drop policy if exists "draft_room: members read" on public.draft_room;
create policy "draft_room: members read" on public.draft_room for select using (public.is_member());
drop policy if exists "draft_room: commish writes" on public.draft_room;
create policy "draft_room: commish writes" on public.draft_room for all using (public.is_commish()) with check (public.is_commish());
insert into public.draft_room (year, starts_at) values (2027, '2027-02-20 19:00:00+08') on conflict (year) do nothing;

-- Every selection made in the room. Skips keep their pick_id with no player; make-up picks have no pick_id.
create table if not exists public.draft_room_picks (
  id         bigserial primary key,
  year       int not null,
  pick_id    int references public.picks(id) on delete set null,
  overall    int,
  round      int,
  team_id    int not null references public.teams(id),
  player_key text,
  player     jsonb,
  how        text not null check (how in ('pick', 'auto', 'skip', 'makeup', 'commish')),
  made_at    timestamptz not null default now()
);
create unique index if not exists draft_room_picks_player on public.draft_room_picks (year, player_key) where player_key is not null;
create unique index if not exists draft_room_picks_pick on public.draft_room_picks (pick_id) where pick_id is not null;
alter table public.draft_room_picks enable row level security;
drop policy if exists "draft_room_picks: members read" on public.draft_room_picks;
create policy "draft_room_picks: members read" on public.draft_room_picks for select using (public.is_member());

-- Each club's private queue.
create table if not exists public.draft_room_queue (
  year       int not null,
  team_id    int not null references public.teams(id),
  player_key text not null,
  player     jsonb not null,
  rank       int not null default 0,
  primary key (year, team_id, player_key)
);
alter table public.draft_room_queue enable row level security;
drop policy if exists "draft_room_queue: own club" on public.draft_room_queue;
create policy "draft_room_queue: own club" on public.draft_room_queue for all
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());

-- Pick trades offered in the room. They go through when the other coach accepts.
create table if not exists public.draft_room_trades (
  id         bigserial primary key,
  year       int not null,
  from_team  int not null references public.teams(id),
  to_team    int not null references public.teams(id),
  give_picks int[] not null default '{}',
  get_picks  int[] not null default '{}',
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'void')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.draft_room_trades enable row level security;
drop policy if exists "draft_room_trades: members read" on public.draft_room_trades;
create policy "draft_room_trades: members read" on public.draft_room_trades for select using (public.is_member());

-- What the room is told.
create table if not exists public.draft_room_feed (
  id      bigserial primary key,
  year    int not null,
  kind    text not null default 'info',
  body    text not null,
  made_at timestamptz not null default now()
);
alter table public.draft_room_feed enable row level security;
drop policy if exists "draft_room_feed: members read" on public.draft_room_feed;
create policy "draft_room_feed: members read" on public.draft_room_feed for select using (public.is_member());

-- ---------------------------------------------------------------------------------------------------------------
-- Who is on the clock: the first usable pick with no selection, then the make-up picks.
create or replace function public.draft_room_current(y int)
returns table (pick_id int, overall int, team_id int, rnd int, makeup boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  r record; lm int; mk int[]; sn boolean; used jsonb := '{}'; keep jsonb; c int; allow int;
begin
  select d.list_max, d.makeups, d.snake into lm, mk, sn from draft_room d where d.year = y;
  if lm is null then return; end if;
  select coalesce(jsonb_object_agg(s.team_id::text, s.n), '{}') into keep
    from (select sq.team_id, count(*) n from squad sq where sq.is_keeper or sq.is_rookie_keeper group by sq.team_id) s;
  for r in
    select p.id, p.overall, p.owner_team_id, p.round from picks p
     where p.year = y and p.kind = 'draft' and p.overall is not null
     order by p.round, case when sn and p.round % 2 = 0 then -p.overall else p.overall end
  loop
    c := coalesce((used ->> r.owner_team_id::text)::int, 0) + 1;
    used := jsonb_set(used, array[r.owner_team_id::text], to_jsonb(c));
    allow := lm - coalesce((keep ->> r.owner_team_id::text)::int, 0);
    if c > allow then continue; end if;
    if exists (select 1 from draft_room_picks d where d.pick_id = r.id) then continue; end if;
    return query select r.id, r.overall, r.owner_team_id, r.round, false;
    return;
  end loop;
  if coalesce(array_length(mk, 1), 0) > 0 then
    return query select null::int, null::int, mk[1], null::int, true;
  end if;
end $$;

-- Record a selection and move the clock on (with a break after every break_every rounds).
create or replace function public.draft_room_record(y int, pkey text, pl jsonb, how text)
returns void language plpgsql security definer set search_path = public as $$
declare cur record; nxt record; rm draft_room; tname text; label text;
begin
  select * into rm from draft_room where year = y;
  select * into cur from draft_room_current(y);
  if cur.team_id is null then raise exception 'Nobody is on the clock'; end if;
  select name into tname from teams where id = cur.team_id;
  label := case when cur.makeup then 'their make-up pick' else 'pick ' || cur.overall end;
  if how = 'skip' then
    insert into draft_room_picks (year, pick_id, overall, round, team_id, how) values (y, cur.pick_id, cur.overall, cur.rnd, cur.team_id, 'skip');
    update draft_room set makeups = makeups || cur.team_id where year = y;
    insert into draft_room_feed (year, kind, body) values (y, 'skip', tname || ' ran out of time with no queue. Pick ' || cur.overall || ' is skipped: they get a make-up pick at the end of the draft.');
  elsif how = 'forfeit' then
    update draft_room set makeups = makeups[2:] where year = y;
    insert into draft_room_feed (year, kind, body) values (y, 'skip', tname || ' ran out of time on their make-up pick with no queue. The pick is forfeited.');
  else
    insert into draft_room_picks (year, pick_id, overall, round, team_id, player_key, player, how)
      values (y, cur.pick_id, cur.overall, cur.rnd, cur.team_id, pkey, pl, case when cur.makeup and how = 'pick' then 'makeup' else how end);
    if cur.makeup then update draft_room set makeups = makeups[2:] where year = y; end if;
    delete from draft_room_queue q where q.year = y and q.player_key = pkey;
    insert into draft_room_feed (year, kind, body) values (y, 'pick',
      'With ' || label || ', ' || tname || ' select ' || coalesce(pl ->> 'n', pkey) ||
      coalesce(' (' || (pl ->> 'club') || ', ' || (pl ->> 'pos') || ')', '') ||
      case how when 'auto' then ' · auto-picked from their queue' when 'commish' then ' · entered by the commish' else '' end || '.');
  end if;
  select * into nxt from draft_room_current(y);
  if nxt.team_id is null then
    update draft_room set status = 'done', on_clock_since = null, updated_at = now() where year = y;
    insert into draft_room_feed (year, kind, body) values (y, 'info', 'That''s the draft done. Thanks for coming.');
  elsif not cur.makeup and not nxt.makeup and rm.break_every > 0 and rm.break_minutes > 0
        and nxt.rnd > cur.rnd and cur.rnd % rm.break_every = 0 then
    update draft_room set on_clock_since = now() + make_interval(mins => rm.break_minutes), updated_at = now() where year = y;
    insert into draft_room_feed (year, kind, body) values (y, 'info', 'End of round ' || cur.rnd || '. ' || rm.break_minutes || ' minute break.');
  else
    update draft_room set on_clock_since = now(), updated_at = now() where year = y;
  end if;
end $$;
revoke all on function public.draft_room_record(int, text, jsonb, text) from public, anon, authenticated;

-- A coach (or the commish) drafts a player.
create or replace function public.draft_room_pick(y int, pkey text, pl jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare rm draft_room; cur record; mine int := public.my_team_id(); boss boolean := public.is_commish();
begin
  select * into rm from draft_room where year = y for update;
  if rm.status <> 'live' then raise exception 'The draft isn''t live'; end if;
  if rm.on_clock_since > now() and not boss then raise exception 'We''re on a break'; end if;
  select * into cur from draft_room_current(y);
  if cur.team_id is null then raise exception 'Nobody is on the clock'; end if;
  if cur.team_id is distinct from mine and not boss then raise exception 'It''s not your pick'; end if;
  if exists (select 1 from draft_room_picks d where d.year = y and d.player_key = pkey) then raise exception 'That player has already been taken'; end if;
  perform draft_room_record(y, pkey, pl, case when cur.team_id is distinct from mine then 'commish' else 'pick' end);
end $$;
grant execute on function public.draft_room_pick(int, text, jsonb) to authenticated;

-- Any open room calls this when the clock hits zero. Safe to call twice: it re-checks the time under a lock.
create or replace function public.draft_room_tick(y int)
returns void language plpgsql security definer set search_path = public as $$
declare rm draft_room; cur record; q record;
begin
  if not public.is_member() then return; end if;
  select * into rm from draft_room where year = y for update;
  if rm.status <> 'live' or rm.on_clock_since is null then return; end if;
  if now() < rm.on_clock_since + make_interval(secs => rm.pick_seconds) then return; end if;
  select * into cur from draft_room_current(y);
  if cur.team_id is null then return; end if;
  select qq.player_key, qq.player into q from draft_room_queue qq
   where qq.year = y and qq.team_id = cur.team_id
     and not exists (select 1 from draft_room_picks d where d.year = y and d.player_key = qq.player_key)
   order by qq.rank limit 1;
  if q.player_key is not null then perform draft_room_record(y, q.player_key, q.player, 'auto');
  elsif cur.makeup then perform draft_room_record(y, null, null, 'forfeit');
  else perform draft_room_record(y, null, null, 'skip');
  end if;
end $$;
grant execute on function public.draft_room_tick(int) to authenticated;

-- Commish: start, pause, resume, undo the last pick, reset.
create or replace function public.draft_room_control(y int, action text)
returns void language plpgsql security definer set search_path = public as $$
declare rm draft_room; lp draft_room_picks; tname text;
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  select * into rm from draft_room where year = y for update;
  if action = 'start' then
    update draft_room set status = 'live', on_clock_since = now(), paused_left = null, updated_at = now() where year = y;
    insert into draft_room_feed (year, kind, body) values (y, 'info', 'The draft is live!');
  elsif action = 'pause' and rm.status = 'live' then
    update draft_room set status = 'paused', updated_at = now(),
      paused_left = greatest(0, rm.pick_seconds - floor(extract(epoch from now() - rm.on_clock_since))::int) where year = y;
    insert into draft_room_feed (year, kind, body) values (y, 'info', 'The commish has paused the draft. The clock is frozen.');
  elsif action = 'resume' and rm.status = 'paused' then
    update draft_room set status = 'live', updated_at = now(),
      on_clock_since = now() - make_interval(secs => rm.pick_seconds - coalesce(rm.paused_left, rm.pick_seconds)), paused_left = null where year = y;
    insert into draft_room_feed (year, kind, body) values (y, 'info', 'Draft resumed.');
  elsif action = 'undo' then
    select * into lp from draft_room_picks where year = y order by id desc limit 1;
    if lp.id is null then return; end if;
    delete from draft_room_picks where id = lp.id;
    if lp.how = 'skip' then
      update draft_room set makeups = makeups[1:array_length(makeups, 1) - 1] where year = y;
    elsif lp.pick_id is null then
      update draft_room set makeups = array[lp.team_id] || makeups where year = y;
    end if;
    update draft_room set on_clock_since = now(), updated_at = now(),
      status = case when status = 'done' then 'live' else status end where year = y;
    select name into tname from teams where id = lp.team_id;
    insert into draft_room_feed (year, kind, body) values (y, 'info', 'The commish undid ' || tname || '''s ' ||
      coalesce('pick ' || lp.overall, 'make-up pick') || coalesce(' (' || (lp.player ->> 'n') || ')', '') || '. They''re back on the clock.');
  elsif action = 'reset' then
    delete from draft_room_picks where year = y;
    delete from draft_room_feed where year = y;
    update draft_room set status = 'scheduled', on_clock_since = null, paused_left = null, makeups = '{}', updated_at = now() where year = y;
  else
    raise exception 'Unknown action %', action;
  end if;
end $$;
grant execute on function public.draft_room_control(int, text) to authenticated;

-- Offer a pick trade to another club.
create or replace function public.draft_room_offer(y int, to_team int, gv int[], gt int[])
returns bigint language plpgsql security definer set search_path = public as $$
declare rm draft_room; mine int := public.my_team_id(); nid bigint;
begin
  select * into rm from draft_room where year = y;
  if not rm.trading then raise exception 'Pick trading is switched off'; end if;
  if mine is null or to_team = mine then raise exception 'Pick a club to trade with'; end if;
  if coalesce(array_length(gv, 1), 0) + coalesce(array_length(gt, 1), 0) = 0 then raise exception 'Add a pick to the trade'; end if;
  if exists (select 1 from unnest(gv) g where not exists (select 1 from picks p where p.id = g and p.owner_team_id = mine and p.year = y))
    then raise exception 'You don''t own one of those picks'; end if;
  if exists (select 1 from unnest(gt) g where not exists (select 1 from picks p where p.id = g and p.owner_team_id = to_team and p.year = y))
    then raise exception 'They don''t own one of those picks'; end if;
  if exists (select 1 from draft_room_picks d where d.pick_id = any (gv || gt)) then raise exception 'One of those picks has been used'; end if;
  insert into draft_room_trades (year, from_team, to_team, give_picks, get_picks) values (y, mine, to_team, gv, gt) returning id into nid;
  return nid;
end $$;
grant execute on function public.draft_room_offer(int, int, int[], int[]) to authenticated;

-- The other coach accepts or declines; the coach who offered can cancel. Accepted trades swap the picks and tell the room.
create or replace function public.draft_room_respond(trade bigint, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t draft_room_trades; mine int := public.my_team_id(); a text; b text; gl text; tl text;
begin
  select * into t from draft_room_trades where id = trade for update;
  if t.id is null or t.status <> 'pending' then raise exception 'That offer is no longer open'; end if;
  if not accept then
    if mine not in (t.from_team, t.to_team) then raise exception 'Not your trade'; end if;
    update draft_room_trades set status = case when mine = t.from_team then 'cancelled' else 'declined' end, decided_at = now() where id = trade;
    return;
  end if;
  if mine <> t.to_team then raise exception 'Only the club receiving the offer can accept it'; end if;
  if exists (select 1 from unnest(t.give_picks) g where not exists (select 1 from picks p where p.id = g and p.owner_team_id = t.from_team))
     or exists (select 1 from unnest(t.get_picks) g where not exists (select 1 from picks p where p.id = g and p.owner_team_id = t.to_team))
     or exists (select 1 from draft_room_picks d where d.pick_id = any (t.give_picks || t.get_picks)) then
    update draft_room_trades set status = 'void', decided_at = now() where id = trade;
    raise exception 'Those picks have changed hands or been used, so the offer is void';
  end if;
  update picks set owner_team_id = t.to_team where id = any (t.give_picks);
  update picks set owner_team_id = t.from_team where id = any (t.get_picks);
  update draft_room_trades set status = 'accepted', decided_at = now() where id = trade;
  select name into a from teams where id = t.from_team;
  select name into b from teams where id = t.to_team;
  select coalesce(string_agg('pick ' || overall, ' + ' order by overall), 'nothing') into gl from picks where id = any (t.give_picks);
  select coalesce(string_agg('pick ' || overall, ' + ' order by overall), 'nothing') into tl from picks where id = any (t.get_picks);
  insert into draft_room_feed (year, kind, body) values (t.year, 'trade', 'Trade done: ' || a || ' get ' || tl || ' from ' || b || ', who get ' || gl || '. Both coaches accepted.');
end $$;
grant execute on function public.draft_room_respond(bigint, boolean) to authenticated;

-- Who has a queue set (the queues themselves stay private).
create or replace function public.draft_room_ready(y int)
returns table (team_id int, queued int) language sql stable security definer set search_path = public as $$
  select q.team_id, count(*)::int from draft_room_queue q where q.year = y and public.is_member() group by q.team_id;
$$;
grant execute on function public.draft_room_ready(int) to authenticated;

-- Everything the room needs in one call, with the server's clock so every screen counts down together.
create or replace function public.draft_room_state(y int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare mine int := public.my_team_id();
begin
  if not public.is_member() then return null; end if;
  return jsonb_build_object(
    'now', now(),
    'room', (select to_jsonb(d) from draft_room d where d.year = y),
    'current', (select to_jsonb(c) from draft_room_current(y) c),
    'sels', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from draft_room_picks s where s.year = y), '[]'),
    'feed', coalesce((select jsonb_agg(f order by f.id desc) from (select id, kind, body, made_at from draft_room_feed where year = y order by id desc limit 40) f), '[]'),
    'picks', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'overall', p.overall, 'round', p.round, 'owner', p.owner_team_id, 'orig', p.original_team_id) order by p.overall)
                        from picks p where p.year = y and p.kind = 'draft' and p.overall is not null), '[]'),
    'trades', coalesce((select jsonb_agg(to_jsonb(t) order by t.id desc) from draft_room_trades t where t.year = y and (t.status = 'pending' or t.decided_at > now() - interval '1 hour')), '[]'),
    'queue', coalesce((select jsonb_agg(jsonb_build_object('key', q.player_key, 'player', q.player) order by q.rank) from draft_room_queue q where q.year = y and q.team_id = mine), '[]')
  );
end $$;
grant execute on function public.draft_room_state(int) to authenticated;
