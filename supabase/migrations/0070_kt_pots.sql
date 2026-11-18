-- Play mini games and side comps for KT. Each club pays its entry into a pot (mini games max 50 KT, comps max 50 KT);
-- when it's decided the league takes 20% into the league bank and the rest goes to the winners.
-- Mini games settle themselves from the locked round's scores (score_rounds.snapshot), so nobody can fudge a result.
-- Comp pots pay out when the commish names the comp's winner.

create table public.kt_pots (
  id serial primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  kind text not null check (kind in ('mini', 'comp')),
  ref text not null,
  label text not null,
  entry int not null check (entry between 1 and 50),
  split text not null default 'wta' check (split in ('wta', '70-30', '60-30-10')),
  cut_pct int not null default 20 check (cut_pct between 0 and 50),
  status text not null default 'open' check (status in ('open', 'paid', 'refunded')),
  pool_kt int, cut_kt int, result jsonb,
  created_at timestamptz not null default now(), settled_at timestamptz,
  unique (league_id, kind, ref)
);
create table public.kt_pot_entries (
  pot_id int not null references public.kt_pots(id) on delete cascade,
  team_id int not null references public.teams(id),
  league_id int not null default public.current_league(),
  kt int not null,
  created_at timestamptz not null default now(),
  primary key (pot_id, team_id)
);
alter table public.kt_pots enable row level security;
alter table public.kt_pot_entries enable row level security;
create policy "league scope" on public.kt_pots as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
create policy "league scope" on public.kt_pot_entries as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
create policy "members read" on public.kt_pots for select to authenticated using ((select public.is_member()));
create policy "members read" on public.kt_pot_entries for select to authenticated using ((select public.is_member()));
-- Anyone can open a mini game pot; comp pots are the commish's. Money only moves through the functions below.
create policy "open a pot" on public.kt_pots for insert to authenticated
  with check (status = 'open' and pool_kt is null and ((kind = 'mini' and (select public.is_member())) or (select public.is_commish())));
create policy "commish edits open comp pots" on public.kt_pots for update to authenticated
  using ((select public.is_commish()) and status = 'open' and not exists (select 1 from public.kt_pot_entries e where e.pot_id = id))
  with check (status = 'open' and pool_kt is null);
create policy "definer access" on public.kt_pots to khq_definer using (true) with check (true);
create policy "definer access" on public.kt_pot_entries to khq_definer using (true) with check (true);
grant select, insert, update on public.kt_pots to authenticated;
grant select on public.kt_pot_entries to authenticated;
grant usage on sequence public.kt_pots_id_seq to authenticated;

-- Can this club be in this pot?
create or replace function public.kt_pot_eligible(p kt_pots, t int) returns boolean language sql stable security definer set search_path = public as $$
  select case p.kind
    when 'mini' then exists (select 1 from mini_games g where g.id = p.ref::bigint and g.league_id = p.league_id and t = any (g.draft_order))
    else exists (select 1 from comp_entries e where e.league_id = p.league_id and e.season = split_part(p.ref, ':', 1)::int and e.comp = split_part(p.ref, ':', 2) and e.team_id = t)
  end
$$;

create or replace function public.kt_pot_enter(p_pot int) returns void language plpgsql security definer set search_path = public as $$
declare p kt_pots; t int := public.my_team_id();
begin
  select * into p from kt_pots where id = p_pot and league_id = public.current_league() for update;
  if p is null or p.status <> 'open' then raise exception 'That pot is closed'; end if;
  if t is null then raise exception 'Only coaches can pay in'; end if;
  if exists (select 1 from kt_pot_entries where pot_id = p_pot and team_id = t) then return; end if;
  if not public.kt_pot_eligible(p, t) then raise exception 'Your club isn''t in this one'; end if;
  if p.kind = 'mini' and exists (select 1 from score_rounds s join mini_games g on g.id = p.ref::bigint
       where s.league_id = p.league_id and s.comp = g.comp and s.round = g.round and s.locked_at is not null) then
    raise exception 'That round is already locked';
  end if;
  if public.kc_bank(t) < p.entry then raise exception 'You need % KT in the bank to pay in', p.entry; end if;
  insert into kt_pot_entries (pot_id, team_id, league_id, kt) values (p_pot, t, p.league_id, p.entry);
  perform public.kc_pay(t, -p.entry, 'Entry: ' || p.label);
end $$;

create or replace function public.kt_pot_leave(p_pot int, p_team int default null) returns void language plpgsql security definer set search_path = public as $$
declare p kt_pots; t int := coalesce(p_team, public.my_team_id()); e kt_pot_entries; lk timestamptz;
begin
  if t is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Not your entry'; end if;
  select * into p from kt_pots where id = p_pot and league_id = public.current_league() for update;
  if p is null or p.status <> 'open' then raise exception 'That pot is settled'; end if;
  select * into e from kt_pot_entries where pot_id = p_pot and team_id = t;
  if e is null then return; end if;
  if p.kind = 'comp' and not public.is_commish() then
    select locks_at into lk from comp_settings where league_id = p.league_id and season = split_part(p.ref, ':', 1)::int;
    if lk is not null and lk < now() then raise exception 'Entries are locked, so the fee stays in'; end if;
  end if;
  if p.kind = 'mini' and not public.is_commish() and exists (select 1 from mini_picks where game_id = p.ref::bigint) then
    raise exception 'The draft has started, so the entry stays in';
  end if;
  delete from kt_pot_entries where pot_id = p_pot and team_id = t;
  perform public.kc_pay(t, e.kt, 'Entry refunded: ' || p.label);
end $$;

-- Pay a pot out to clubs in finishing order (best first). Internal: called by the settle functions below.
create or replace function public.kt_pot_payout(p_pot int, p_order int[]) returns void language plpgsql security definer set search_path = public as $$
declare p kt_pots; n int; pool int; cut int; net int; pct int[]; tot int; share int; paid int := 0; i int; res jsonb := '[]';
begin
  select * into p from kt_pots where id = p_pot for update;
  if p.status <> 'open' then return; end if;
  select count(*), coalesce(sum(kt), 0) into n, pool from kt_pot_entries where pot_id = p_pot;
  if n = 0 then update kt_pots set status = 'paid', pool_kt = 0, cut_kt = 0, settled_at = now() where id = p_pot; return; end if;
  if n = 1 then  -- nobody to play against: give it back
    perform public.kc_pay(e.team_id, e.kt, 'Entry refunded: ' || p.label) from kt_pot_entries e where e.pot_id = p_pot;
    update kt_pots set status = 'refunded', pool_kt = pool, cut_kt = 0, settled_at = now() where id = p_pot; return;
  end if;
  cut := floor(pool * p.cut_pct / 100.0); net := pool - cut;
  pct := case p.split when '70-30' then array[70, 30] when '60-30-10' then array[60, 30, 10] else array[100] end;
  pct := pct[1:greatest(1, least(array_length(pct, 1), n - 1, coalesce(array_length(p_order, 1), 1)))];
  select sum(x) into tot from unnest(pct) x;
  for i in 1 .. array_length(pct, 1) loop
    exit when i > coalesce(array_length(p_order, 1), 0);
    share := case when i = 1 then net - (select coalesce(sum(floor(net * x / tot::numeric)), 0) from unnest(pct[2:]) x)::int else floor(net * pct[i] / tot::numeric)::int end;
    perform public.kc_pay(p_order[i], share, case i when 1 then 'Won: ' when 2 then 'Runner-up: ' else 'Third: ' end || p.label);
    paid := paid + share;
    res := res || jsonb_build_object('team', p_order[i], 'place', i, 'kt', share);
  end loop;
  update kt_pots set status = 'paid', pool_kt = pool, cut_kt = pool - paid, result = res, settled_at = now() where id = p_pot;
end $$;

-- Mini game: settle from the locked round. Anyone can trigger it; the scores come from the commish's locked snapshot.
create or replace function public.kt_pot_settle_mini(p_pot int) returns boolean language plpgsql security definer set search_path = public as $$
declare p kt_pots; g mini_games; snap jsonb; ord int[];
begin
  select * into p from kt_pots where id = p_pot and league_id = public.current_league() and kind = 'mini';
  if p is null or p.status <> 'open' then return false; end if;
  select * into g from mini_games where id = p.ref::bigint;
  if g is null then return false; end if;
  select snapshot into snap from score_rounds where league_id = p.league_id and comp = g.comp and round = g.round and locked_at is not null;
  if snap is null then return false; end if;
  if g.kind <> 'cap5' and g.status <> 'done' then  -- draft never finished: refund everyone
    perform public.kc_pay(e.team_id, e.kt, 'Entry refunded: ' || p.label) from kt_pot_entries e where e.pot_id = p_pot;
    update kt_pots set status = 'refunded', settled_at = now() where id = p_pot; return true;
  end if;
  with scores as (
    select e.team_id,
      case when g.kind = 'cap5' then
        coalesce((select sum(coalesce((snap ->> pl::text)::numeric, 0) * case when pl = me.captain then 2 else 1 end)
                  from mini_entries me, unnest(me.players) pl where me.game_id = g.id and me.team_id = e.team_id), 0)
      else
        coalesce((select sum(coalesce((snap ->> mp.player_id::text)::numeric, 0)) from mini_picks mp where mp.game_id = g.id and mp.team_id = e.team_id), 0)
      end s,
      array_position(g.draft_order, e.team_id) pos
    from kt_pot_entries e where e.pot_id = p_pot
  )
  select array_agg(team_id order by s desc, pos) into ord from scores;
  perform public.kt_pot_payout(p_pot, ord);
  return true;
end $$;

-- Comp pot: the commish names the winner (and runner-up/third if the split pays them).
create or replace function public.kt_pot_settle_comp(p_pot int, p_order int[]) returns void language plpgsql security definer set search_path = public as $$
declare p kt_pots;
begin
  if not public.is_commish() then raise exception 'Only the commish settles comps'; end if;
  select * into p from kt_pots where id = p_pot and league_id = public.current_league() and kind = 'comp';
  if p is null or p.status <> 'open' then raise exception 'That pot is settled'; end if;
  if exists (select 1 from unnest(p_order) t where not exists (select 1 from kt_pot_entries e where e.pot_id = p_pot and e.team_id = t)) then
    raise exception 'Only clubs that paid in can win the pot';
  end if;
  perform public.kt_pot_payout(p_pot, p_order);
end $$;

-- Commish: hand every entry back (game cancelled, comp scrapped).
create or replace function public.kt_pot_refund(p_pot int) returns void language plpgsql security definer set search_path = public as $$
declare p kt_pots;
begin
  if not public.is_commish() then raise exception 'Only the commish can refund a pot'; end if;
  select * into p from kt_pots where id = p_pot and league_id = public.current_league() for update;
  if p is null or p.status <> 'open' then raise exception 'That pot is settled'; end if;
  perform public.kc_pay(e.team_id, e.kt, 'Entry refunded: ' || p.label) from kt_pot_entries e where e.pot_id = p_pot;
  update kt_pots set status = 'refunded', settled_at = now() where id = p_pot;
end $$;

-- The league bank now also counts the 20% cut from settled pots.
create or replace function public.kc_league_bank()
returns json language sql stable security definer set search_path = public as $$
  with lg as (select public.current_league() id),
  fees as (
    select case
             when reason like 'Deficit fee%' then 'deficit'
             when reason like 'Extension fee%' then 'extension'
             when reason like 'Release fee%' then 'release'
             when reason like 'Matched clause (burned)%' then 'burned'
           end src, -delta kt
      from kc_ledger, lg where league_id = lg.id and delta < 0
    union all
    select 'levy', levy_kt from kc_transfers, lg where league_id = lg.id and levy_kt > 0
    union all
    select 'games', cut_kt from kt_pots, lg where league_id = lg.id and status = 'paid' and cut_kt > 0
  ),
  inflow as (select src, sum(kt)::int kt from fees where src is not null group by src),
  paid as (select coalesce(sum(kt), 0)::int kt from bank_prizes, lg where league_id = lg.id and status = 'paid'),
  pledged as (select coalesce(sum(kt), 0)::int kt from bank_prizes, lg where league_id = lg.id and status = 'pledged')
  select json_build_object(
    'sources', coalesce((select json_object_agg(src, kt) from inflow), '{}'::json),
    'collected', coalesce((select sum(kt) from inflow), 0),
    'paid', (select kt from paid),
    'pledged', (select kt from pledged),
    'balance', coalesce((select sum(kt) from inflow), 0) - (select kt from paid))
  where public.is_member()
$$;

revoke execute on function public.kt_pot_eligible(kt_pots, int) from public, anon, authenticated;
revoke execute on function public.kt_pot_payout(int, int[]) from public, anon, authenticated;
revoke execute on function public.kt_pot_enter(int) from public, anon;
revoke execute on function public.kt_pot_leave(int, int) from public, anon;
revoke execute on function public.kt_pot_settle_mini(int) from public, anon;
revoke execute on function public.kt_pot_settle_comp(int, int[]) from public, anon;
revoke execute on function public.kt_pot_refund(int) from public, anon;
grant execute on function public.kt_pot_enter(int), public.kt_pot_leave(int, int), public.kt_pot_settle_mini(int),
  public.kt_pot_settle_comp(int, int[]), public.kt_pot_refund(int) to authenticated;
grant create on schema public to khq_definer;
alter function public.kt_pot_eligible(kt_pots, int) owner to khq_definer;
alter function public.kt_pot_enter(int) owner to khq_definer;
alter function public.kt_pot_leave(int, int) owner to khq_definer;
alter function public.kt_pot_payout(int, int[]) owner to khq_definer;
alter function public.kt_pot_settle_mini(int) owner to khq_definer;
alter function public.kt_pot_settle_comp(int, int[]) owner to khq_definer;
alter function public.kt_pot_refund(int) owner to khq_definer;
alter function public.kc_league_bank() owner to khq_definer;
revoke create on schema public from khq_definer;
