-- Trades carry tokens and contracts.
--  - A trade-desk item can be KT (paper tokens) moving between clubs, alongside players and picks.
--  - When a desk trade executes, each traded player's contract (and any signed extension) moves with him,
--    KT changes hands, and every club involved must still be under the season cap.
--  - A player already agreed to join another club at season end, or with a clause waiting on a match, can't be traded.

alter table public.desk_items add column if not exists kt int check (kt is null or kt > 0);
alter table public.desk_items drop constraint if exists desk_items_check1;
alter table public.desk_items add constraint desk_items_one_asset check (num_nonnulls(player_id, pick_id, kt) = 1);

alter table public.kc_transfers drop constraint if exists kc_transfers_kind_check;
alter table public.kc_transfers add constraint kc_transfers_kind_check
  check (kind in ('clause', 'auction', 'free_agent', 'release', 'extension', 'tier', 'seed', 'match', 'deficit', 'draft', 'pending', 'trade'));

create or replace function public.desk_item_check() returns trigger language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from public.desks where id = new.desk_id;
  if st <> 'open' then raise exception 'This desk is no longer open'; end if;
  if new.player_id is not null and not exists (select 1 from public.squad where player_id = new.player_id and team_id = new.from_team_id) then
    raise exception 'That player isn’t on the sending team’s list';
  end if;
  if new.player_id is not null and exists (select 1 from public.kc_settings where league_id = public.current_league()) then
    if public.kc_moving(new.player_id, new.from_team_id) then raise exception 'He’s already agreed to join another club at season end'; end if;
    if exists (select 1 from public.kc_claims where player_id = new.player_id and status = 'pending' and league_id = public.current_league()) then
      raise exception 'His release clause has been paid and is waiting on a match';
    end if;
  end if;
  if new.pick_id is not null and not exists (select 1 from public.picks where id = new.pick_id and owner_team_id = new.from_team_id) then
    raise exception 'The sending team doesn’t own that pick';
  end if;
  if new.kt is not null then
    if not exists (select 1 from public.kc_settings where league_id = public.current_league()) then raise exception 'Tokens aren’t set up in this league yet'; end if;
    if public.kc_bank(new.from_team_id) < new.kt then raise exception 'They only have % KT', public.kc_bank(new.from_team_id); end if;
  end if;
  insert into public.desk_teams (desk_id, team_id) values (new.desk_id, new.from_team_id), (new.desk_id, new.to_team_id) on conflict do nothing;
  return new;
end $$;

create or replace function public.execute_desk(p_desk uuid) returns void language plpgsql security definer set search_path = public as $$
declare it record; k kc_settings; t int; teams_in int[] := '{}';
begin
  if not public.is_commish() then raise exception 'Only the commissioner can execute a trade'; end if;
  if (select status from public.desks where id = p_desk) <> 'agreed' then raise exception 'Every team has to accept first'; end if;
  select * into k from public.kc_settings where league_id = public.current_league();
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
