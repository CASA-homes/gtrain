-- Draft sign-off: review the results, fix picks, coaches tick their lists, the commish posts it into squads.
-- Posting: every drafted player joins his new club's squad (unowned players and 2026 draftees are added to the
-- player database first), players not kept and not drafted come off their lists, and a "2027 Draft results"
-- news post goes up. A snapshot of every squad is saved first so the commish can undo the post.

alter table public.draft_room drop constraint if exists draft_room_status_check;
alter table public.draft_room add constraint draft_room_status_check check (status in ('scheduled', 'live', 'paused', 'done', 'posted'));
alter table public.draft_room add column if not exists posted_at timestamptz;
alter table public.draft_room add column if not exists posted_by uuid;
alter table public.draft_room add column if not exists snapshot jsonb;
alter table public.draft_room add column if not exists news_id uuid;
alter table public.draft_room_picks add column if not exists edited boolean not null default false;

-- Coaches tick "my picks look right".
create table if not exists public.draft_room_checks (
  year       int not null,
  team_id    int not null references public.teams(id),
  checked_at timestamptz not null default now(),
  primary key (year, team_id)
);
alter table public.draft_room_checks enable row level security;
drop policy if exists "draft_room_checks: members read" on public.draft_room_checks;
create policy "draft_room_checks: members read" on public.draft_room_checks for select using ((select public.is_member()));
drop policy if exists "draft_room_checks: own club" on public.draft_room_checks;
create policy "draft_room_checks: own club" on public.draft_room_checks for insert with check (team_id = (select public.my_team_id()));
drop policy if exists "draft_room_checks: own club removes" on public.draft_room_checks;
create policy "draft_room_checks: own club removes" on public.draft_room_checks for delete using (team_id = (select public.my_team_id()));

-- Coaches ask the commish for a change.
create table if not exists public.draft_room_requests (
  id         bigserial primary key,
  year       int not null,
  team_id    int not null references public.teams(id),
  body       text not null check (length(body) between 1 and 1000),
  status     text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_at timestamptz not null default now()
);
alter table public.draft_room_requests enable row level security;
drop policy if exists "draft_room_requests: members read" on public.draft_room_requests;
create policy "draft_room_requests: members read" on public.draft_room_requests for select using ((select public.is_member()));
drop policy if exists "draft_room_requests: own club asks" on public.draft_room_requests;
create policy "draft_room_requests: own club asks" on public.draft_room_requests for insert with check (team_id = (select public.my_team_id()));
drop policy if exists "draft_room_requests: commish answers" on public.draft_room_requests;
create policy "draft_room_requests: commish answers" on public.draft_room_requests for update using ((select public.is_commish()));

-- Commish fixes a pick: swap the player, move it to another club, or clear it. The clubs involved lose their tick.
create or replace function public.draft_room_edit(sel bigint, action text, pkey text default null, pl jsonb default null, team int default null)
returns void language plpgsql security definer set search_path = public as $$
declare s draft_room_picks; st text; tname text; label text;
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  select * into s from draft_room_picks where id = sel for update;
  if s.id is null then raise exception 'Pick not found'; end if;
  select status into st from draft_room where year = s.year;
  if st = 'posted' then raise exception 'The draft has been posted. Undo the post first.'; end if;
  label := coalesce('pick ' || s.overall, 'a make-up pick');
  if action = 'swap' then
    if pkey is null or pl is null then raise exception 'Choose a player'; end if;
    if exists (select 1 from draft_room_picks d where d.year = s.year and d.player_key = pkey and d.id <> s.id) then raise exception 'That player has already been drafted'; end if;
    update draft_room_picks set player_key = pkey, player = pl, how = case when how = 'skip' then 'commish' else how end, edited = true where id = sel;
    select name into tname from teams where id = s.team_id;
    insert into draft_room_feed (year, kind, body) values (s.year, 'info', 'The commish changed ' || tname || '''s ' || label || ' to ' || coalesce(pl ->> 'n', pkey) || '.');
  elsif action = 'move' then
    if team is null or not exists (select 1 from teams where id = team) then raise exception 'Choose a club'; end if;
    update draft_room_picks set team_id = team, edited = true where id = sel;
    delete from draft_room_checks c where c.year = s.year and c.team_id = team;
    select name into tname from teams where id = team;
    insert into draft_room_feed (year, kind, body) values (s.year, 'info', 'The commish moved ' || label || coalesce(' (' || (s.player ->> 'n') || ')', '') || ' to ' || tname || '.');
  elsif action = 'clear' then
    update draft_room_picks set player_key = null, player = null, how = 'skip', edited = true where id = sel;
    select name into tname from teams where id = s.team_id;
    insert into draft_room_feed (year, kind, body) values (s.year, 'info', 'The commish cleared ' || tname || '''s ' || label || '.');
  else
    raise exception 'Unknown action %', action;
  end if;
  delete from draft_room_checks c where c.year = s.year and c.team_id = s.team_id;
end $$;
grant execute on function public.draft_room_edit(bigint, text, text, jsonb, int) to authenticated;

-- Commish signs off: everything goes into squads in one go.
-- newp: [{ key, player: { name, full_name, afl_club, positions, dfs_id, birth_date, draft_year, draft_pick, height_cm, debut_year, career_games, hist },
--          season: { games, average, last5, box, games_log } | null }] for every drafted player not already in the players table.
create or replace function public.draft_room_post(y int, newp jsonb, title text, details text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rm draft_room; s record; np jsonb; pid int; snap jsonb; nid uuid;
  added int := 0; created int := 0; moved int := 0; released int := 0;
  map jsonb := '{}';
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  select * into rm from draft_room where year = y for update;
  if rm.status <> 'done' then raise exception 'The draft has to be finished before it can be posted'; end if;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]') into snap from squad q;

  -- 1. Work out (or create) the player id for every drafted player.
  for s in select * from draft_room_picks d where d.year = y and d.player_key is not null order by d.id loop
    pid := null; np := null;
    if s.player_key ~ '^p:[0-9]+$' then
      select p.id into pid from players p where p.id = substring(s.player_key from 3)::int;
    end if;
    if pid is null then
      select e into np from jsonb_array_elements(newp) e where e ->> 'key' = s.player_key limit 1;
      if np is null then raise exception 'Missing details for %', coalesce(s.player ->> 'n', s.player_key); end if;
      select p.id into pid from players p
       where (np -> 'player' ->> 'dfs_id' is not null and p.dfs_id = np -> 'player' ->> 'dfs_id')
          or (p.name = np -> 'player' ->> 'name' and p.positions = array(select jsonb_array_elements_text(np -> 'player' -> 'positions')))
       limit 1;
      if pid is null then
        insert into players (name, full_name, afl_club, positions, birth_date, draft_year, draft_pick, dfs_id, height_cm, debut_year, career_games, hist)
        values (np -> 'player' ->> 'name', np -> 'player' ->> 'full_name', np -> 'player' ->> 'afl_club',
                array(select jsonb_array_elements_text(np -> 'player' -> 'positions')),
                (np -> 'player' ->> 'birth_date')::date, (np -> 'player' ->> 'draft_year')::int, (np -> 'player' ->> 'draft_pick')::int,
                np -> 'player' ->> 'dfs_id', round((np -> 'player' ->> 'height_cm')::numeric)::int, (np -> 'player' ->> 'debut_year')::int,
                (np -> 'player' ->> 'career_games')::int, np -> 'player' -> 'hist')
        returning id into pid;
        created := created + 1;
        if jsonb_typeof(np -> 'season') = 'object' then
          insert into player_seasons (player_id, season, games, average, last5, box, games_log)
          values (pid, (y - 1), (np -> 'season' ->> 'games')::int, (np -> 'season' ->> 'average')::numeric,
                  array(select nullif(x, 'null')::numeric::int from jsonb_array_elements_text(coalesce(np -> 'season' -> 'last5', '[]')) x),
                  np -> 'season' -> 'box', np -> 'season' -> 'games_log')
          on conflict do nothing;
        end if;
      end if;
    end if;
    map := map || jsonb_build_object(s.id::text, pid);
  end loop;

  -- 2. Players not kept come off their lists.
  with gone as (delete from squad q where not (q.is_keeper or q.is_rookie_keeper) returning q.player_id)
  select count(*) into released from gone;

  -- 3. Drafted players join their new clubs.
  for s in select * from draft_room_picks d where d.year = y and d.player_key is not null order by d.id loop
    pid := (map ->> s.id::text)::int;
    if exists (select 1 from jsonb_array_elements(snap) e where (e ->> 'player_id')::int = pid) then moved := moved + 1; end if;
    insert into squad (player_id, team_id, is_keeper, is_rookie_keeper, acquired_how, acquired_season, updated_at)
    values (pid, s.team_id, false, false, 'draft', y, now())
    on conflict (player_id) do update set team_id = excluded.team_id, acquired_how = 'draft', acquired_season = y, lineup = null, lineup_pos = null, updated_at = now();
    added := added + 1;
  end loop;
  released := released - moved;

  -- 4. Tell the league.
  insert into news (kind, title, details, pinned) values ('Draft day', title, details, true) returning id into nid;
  update draft_room set status = 'posted', posted_at = now(), posted_by = auth.uid(), snapshot = snap, news_id = nid, updated_at = now() where year = y;
  insert into draft_room_feed (year, kind, body) values (y, 'info', 'The commish signed off the draft. Every club''s ' || y || ' list is updated.');
  return jsonb_build_object('added', added, 'created', created, 'moved', moved, 'released', released);
end $$;
grant execute on function public.draft_room_post(int, jsonb, text, text) to authenticated;

-- Commish undoes the post: every squad goes back to the snapshot and the news post comes down. The picks stay.
create or replace function public.draft_room_unpost(y int)
returns void language plpgsql security definer set search_path = public as $$
declare rm draft_room;
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  select * into rm from draft_room where year = y for update;
  if rm.status <> 'posted' or rm.snapshot is null then raise exception 'The draft hasn''t been posted'; end if;
  delete from squad where true;
  insert into squad select * from jsonb_populate_recordset(null::squad, rm.snapshot);
  if rm.news_id is not null then delete from news where id = rm.news_id; end if;
  update draft_room set status = 'done', posted_at = null, posted_by = null, snapshot = null, news_id = null, updated_at = now() where year = y;
  insert into draft_room_feed (year, kind, body) values (y, 'info', 'The commish undid the post. Lists are back to how they were and the draft is awaiting sign-off again.');
end $$;
grant execute on function public.draft_room_unpost(int) to authenticated;

-- Reset and undo are blocked once the draft is posted (the rest of this function is as in 0022).
-- Commish: start, pause, resume, undo the last pick, reset.
create or replace function public.draft_room_control(y int, action text)
returns void language plpgsql security definer set search_path = public as $$
declare rm draft_room; lp draft_room_picks; tname text;
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  select * into rm from draft_room where year = y for update;
  if rm.status = 'posted' then raise exception 'The draft has been posted. Undo the post first.'; end if;
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

-- The room's polling call leaves out the posting snapshot (it's only needed to undo).
create or replace function public.draft_room_state(y int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare mine int := public.my_team_id();
begin
  if not public.is_member() then return null; end if;
  return jsonb_build_object(
    'now', now(),
    'room', (select to_jsonb(d) - 'snapshot' from draft_room d where d.year = y),
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
