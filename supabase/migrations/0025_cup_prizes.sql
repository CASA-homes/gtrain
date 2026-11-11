-- Knockout Cup prizes: the winner gets a bonus pick at the start of round 2 of next year's draft, the runner-up one
-- at the start of round 4 (rounds set by the commish). Switched on and off on the Knockout Cup page or in League settings.
-- The commish awards them once the final is in; they can be traded like any pick and count toward list spots.

create table if not exists public.cup_settings (
  season        int primary key,
  prizes_on     boolean not null default true,
  winner_round  int not null default 2 check (winner_round between 1 and 16),
  runner_round  int not null default 4 check (runner_round between 1 and 16),
  awarded_at    timestamptz,
  winner_team   int references public.teams(id),
  runner_team   int references public.teams(id),
  updated_at    timestamptz not null default now()
);
alter table public.cup_settings enable row level security;
drop policy if exists "cup_settings: members read" on public.cup_settings;
create policy "cup_settings: members read" on public.cup_settings for select using ((select public.is_member()));
drop policy if exists "cup_settings: commish writes" on public.cup_settings;
create policy "cup_settings: commish writes" on public.cup_settings for all using ((select public.is_commish())) with check ((select public.is_commish()));
insert into public.cup_settings (season) values (2027) on conflict (season) do nothing;

-- Bonus picks: a label, and whether the pick goes first in its round.
alter table public.picks add column if not exists bonus text;
alter table public.picks add column if not exists slot_first boolean not null default false;

-- Commish awards the Cup picks for a season.
create or replace function public.cup_award_prizes(season_in int, winner int, runner int)
returns void language plpgsql security definer set search_path = public as $$
declare cs cup_settings;
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  select * into cs from cup_settings c where c.season = season_in for update;
  if cs.season is null then raise exception 'No Cup settings for %', season_in; end if;
  if not cs.prizes_on then raise exception 'Cup pick prizes are switched off'; end if;
  if cs.awarded_at is not null then raise exception 'The Cup picks have already been awarded'; end if;
  if winner is null or runner is null or winner = runner then raise exception 'The final isn''t decided yet'; end if;
  insert into picks (year, round, overall, original_team_id, owner_team_id, kind, bonus, slot_first)
  values (season_in + 1, cs.winner_round, null, winner, winner, 'draft', 'Cup winner ' || season_in, true),
         (season_in + 1, cs.runner_round, null, runner, runner, 'draft', 'Cup runner-up ' || season_in, true);
  update cup_settings set awarded_at = now(), winner_team = winner, runner_team = runner, updated_at = now() where season = season_in;
end $$;
grant execute on function public.cup_award_prizes(int, int, int) to authenticated;

-- Commish takes them back (only while unused in a draft).
create or replace function public.cup_unaward_prizes(season_in int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  if exists (select 1 from draft_room_picks d join picks p on p.id = d.pick_id where p.bonus in ('Cup winner ' || season_in, 'Cup runner-up ' || season_in))
    then raise exception 'A Cup pick has already been used in the draft'; end if;
  delete from picks where year = season_in + 1 and bonus in ('Cup winner ' || season_in, 'Cup runner-up ' || season_in);
  update cup_settings set awarded_at = null, winner_team = null, runner_team = null, updated_at = now() where season = season_in;
end $$;
grant execute on function public.cup_unaward_prizes(int) to authenticated;

-- The draft room puts bonus picks first in their round.
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
     where p.year = y and p.kind = 'draft' and (p.overall is not null or p.slot_first)
     order by p.round, (not p.slot_first), case when sn and p.round % 2 = 0 then -p.overall else p.overall end
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
    'picks', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'overall', p.overall, 'round', p.round, 'owner', p.owner_team_id, 'orig', p.original_team_id, 'bonus', p.bonus, 'first', p.slot_first) order by p.round, (not p.slot_first), p.overall)
                        from picks p where p.year = y and p.kind = 'draft' and (p.overall is not null or p.slot_first)), '[]'),
    'trades', coalesce((select jsonb_agg(to_jsonb(t) order by t.id desc) from draft_room_trades t where t.year = y and (t.status = 'pending' or t.decided_at > now() - interval '1 hour')), '[]'),
    'queue', coalesce((select jsonb_agg(jsonb_build_object('key', q.player_key, 'player', q.player) order by q.rank) from draft_room_queue q where q.year = y and q.team_id = mine), '[]')
  );
end $$;
grant execute on function public.draft_room_state(int) to authenticated;

-- Feed wording for bonus picks (they have no pick number until the order is set).
-- Record a selection and move the clock on (with a break after every break_every rounds).
create or replace function public.draft_room_record(y int, pkey text, pl jsonb, how text)
returns void language plpgsql security definer set search_path = public as $$
declare cur record; nxt record; rm draft_room; tname text; label text;
begin
  select * into rm from draft_room where year = y;
  select * into cur from draft_room_current(y);
  if cur.team_id is null then raise exception 'Nobody is on the clock'; end if;
  select name into tname from teams where id = cur.team_id;
  label := case when cur.makeup then 'their make-up pick' when cur.overall is null then 'their Cup bonus pick' else 'pick ' || cur.overall end;
  if how = 'skip' then
    insert into draft_room_picks (year, pick_id, overall, round, team_id, how) values (y, cur.pick_id, cur.overall, cur.rnd, cur.team_id, 'skip');
    update draft_room set makeups = makeups || cur.team_id where year = y;
    insert into draft_room_feed (year, kind, body) values (y, 'skip', tname || ' ran out of time with no queue. ' || initcap(label) || ' is skipped: they get a make-up pick at the end of the draft.');
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

