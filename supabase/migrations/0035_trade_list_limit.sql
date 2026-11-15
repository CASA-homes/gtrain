-- Trades respect the 33-player list limit. A club that would end up with too many names releases players as part of
-- the deal: it picks them on the desk, and they're delisted (contract released, dead money as usual) when the trade
-- executes. If any club would still be over 33, the trade can't go through.

create table if not exists public.desk_drops (
  id         bigint generated always as identity primary key,
  league_id  int not null default public.current_league() references public.leagues(id) on delete cascade,
  desk_id    uuid not null references public.desks(id) on delete cascade,
  team_id    int not null references public.teams(id) on delete cascade,
  player_id  int not null references public.players(id),
  created_at timestamptz not null default now(),
  unique (desk_id, player_id)
);
alter table public.desk_drops enable row level security;
drop policy if exists "league scope" on public.desk_drops;
create policy "league scope" on public.desk_drops as restrictive for all using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
drop policy if exists "definer access" on public.desk_drops;
create policy "definer access" on public.desk_drops for all to khq_definer using (true) with check (true);
drop policy if exists "desk_drops: members read" on public.desk_drops;
create policy "desk_drops: members read" on public.desk_drops for select using ((select public.is_member()));
drop policy if exists "desk_drops: own club adds" on public.desk_drops;
create policy "desk_drops: own club adds" on public.desk_drops for insert with check (team_id = (select public.my_team_id()) or (select public.is_commish()));
drop policy if exists "desk_drops: own club removes" on public.desk_drops;
create policy "desk_drops: own club removes" on public.desk_drops for delete using (team_id = (select public.my_team_id()) or (select public.is_commish()));

create or replace function public.desk_drop_check() returns trigger language plpgsql security definer set search_path = public as $$
declare d uuid := coalesce(new.desk_id, old.desk_id);
begin
  if (select status from public.desks where id = d) not in ('open', 'agreed') then raise exception 'This desk is closed'; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.squad where player_id = new.player_id and team_id = new.team_id) then raise exception 'He isn’t on your list'; end if;
    if exists (select 1 from public.desk_items where desk_id = new.desk_id and player_id = new.player_id) then raise exception 'He’s already part of the trade'; end if;
  end if;
  update public.desk_teams set accepted = false, accepted_at = null where desk_id = d and accepted;
  update public.desks set status = 'open' where id = d and status = 'agreed';
  return coalesce(new, old);
end $$;
drop trigger if exists desk_drop_check on public.desk_drops;
create trigger desk_drop_check before insert or delete on public.desk_drops for each row execute function public.desk_drop_check();

-- How many names a club would have after a desk executes (incoming players, outgoing players, releases).
create or replace function public.desk_list_after(p_desk uuid, t int) returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from squad where team_id = t)::int
       + (select count(*) from desk_items where desk_id = p_desk and player_id is not null and to_team_id = t)::int
       - (select count(*) from desk_items where desk_id = p_desk and player_id is not null and from_team_id = t)::int
       - (select count(*) from desk_drops where desk_id = p_desk and team_id = t)::int
$$;

create or replace function public.execute_desk(p_desk uuid) returns void language plpgsql security definer set search_path = public as $$
declare it record; dr record; k kc_settings; t int; teams_in int[] := '{}'; n int; cid bigint;
begin
  if not public.is_commish() then raise exception 'Only the commissioner can execute a trade'; end if;
  if (select status from public.desks where id = p_desk) <> 'agreed' then raise exception 'Every team has to accept first'; end if;
  select * into k from public.kc_settings where league_id = public.current_league();
  for t in select distinct x from (select from_team_id x from desk_items where desk_id = p_desk union select to_team_id from desk_items where desk_id = p_desk) q loop
    n := public.desk_list_after(p_desk, t);
    if n > 33 then
      raise exception '% would have % on their list. They need to release % more on the desk first', (select name from teams where id = t), n, n - 33;
    end if;
  end loop;

  -- Releases first, so the incoming players have room.
  for dr in select * from public.desk_drops where desk_id = p_desk loop
    if not exists (select 1 from public.squad where player_id = dr.player_id and team_id = dr.team_id) then raise exception 'A player marked for release has changed hands'; end if;
    if k.league_id is not null then
      select id into cid from public.kc_contracts where player_id = dr.player_id and team_id = dr.team_id and status = 'active' and league_id = k.league_id;
      if cid is not null then perform public.kc_release(cid); end if;
    end if;
    delete from public.squad where player_id = dr.player_id and team_id = dr.team_id;
    update public.ownership set to_season = extract(year from now())::int where player_id = dr.player_id and to_season is null;
  end loop;

  for it in select * from public.desk_items where desk_id = p_desk loop
    teams_in := teams_in || it.from_team_id || it.to_team_id;
    if it.player_id is not null then
      if not exists (select 1 from public.squad where player_id = it.player_id and team_id = it.from_team_id) then
        raise exception 'A player has changed hands since this deal was agreed';
      end if;
      update public.squad set team_id = it.to_team_id, is_keeper = false, is_rookie_keeper = false, lineup = null,
        acquired_how = 'Trade desk', acquired_season = extract(year from now())::int, updated_at = now()
       where player_id = it.player_id;
      update public.ownership set to_season = extract(year from now())::int where player_id = it.player_id and to_season is null;
      insert into public.ownership (player_id, team_id, from_season, how) values (it.player_id, it.to_team_id, extract(year from now())::int, 'Trade desk');
      if k.league_id is not null then
        if public.kc_moving(it.player_id, it.from_team_id) then raise exception '% has agreed to join another club at season end', public.kc_pname(it.player_id); end if;
        update public.kc_contracts set team_id = it.to_team_id, home_grown = false, updated_at = now()
         where player_id = it.player_id and team_id = it.from_team_id and status in ('active', 'pending') and league_id = k.league_id;
        update public.kc_auctions set status = 'cancelled' where player_id = it.player_id and status = 'open' and league_id = k.league_id;
        perform public.kc_log(it.player_id, it.from_team_id, it.to_team_id, 'trade', 0, 0, 'Trade desk');
      end if;
    elsif it.pick_id is not null then
      if not exists (select 1 from public.picks where id = it.pick_id and owner_team_id = it.from_team_id) then
        raise exception 'A pick has changed hands since this deal was agreed';
      end if;
      update public.picks set owner_team_id = it.to_team_id where id = it.pick_id;
    else
      if k.league_id is null then raise exception 'Tokens aren’t set up in this league'; end if;
      if public.kc_bank(it.from_team_id) < it.kt then raise exception 'A club no longer has the tokens it offered'; end if;
      perform public.kc_pay(it.from_team_id, -it.kt, 'Trade: paid ' || it.kt || ' KT');
      perform public.kc_pay(it.to_team_id, it.kt, 'Trade: received ' || it.kt || ' KT');
      perform public.kc_log(null::int, it.from_team_id, it.to_team_id, 'trade', it.kt, 0, it.kt || ' KT in a trade');
    end if;
  end loop;
  if k.league_id is not null then
    foreach t in array (select array_agg(distinct x) from unnest(teams_in) x) loop
      if public.kc_salary(t, k.season) > k.season_cap_k then
        raise exception '% would be over the $%k season cap after this trade', (select name from public.teams where id = t), k.season_cap_k;
      end if;
    end loop;
  end if;
  update public.desks set status = 'done', decided_at = now() where id = p_desk;
end $$;

grant create on schema public to khq_definer;
alter function public.desk_drop_check() owner to khq_definer;
alter function public.desk_list_after(uuid, int) owner to khq_definer;
revoke create on schema public from khq_definer;
