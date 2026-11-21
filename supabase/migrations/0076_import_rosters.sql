-- Commish imports rosters (from a spreadsheet now, screenshots next): renames clubs to their real names and puts each
-- player on his club's list. Nobody is a keeper yet; the commish sets contracts up afterwards as usual.
create or replace function public.import_rosters(p_clubs jsonb, p_replace boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare lid int := public.current_league(); c jsonb; p jsonb; tid int; nm text; sc text; n_players int := 0; n_clubs int := 0; ids int[] := '{}'; pid int;
begin
  if not public.is_commish() then raise exception 'Only the commish can import rosters'; end if;
  if lid = 1 then raise exception 'G-Train''s lists are already set'; end if;
  -- Check everything first: clubs belong to this league, no player twice.
  for c in select * from jsonb_array_elements(coalesce(p_clubs, '[]')) loop
    tid := (c ->> 'team_id')::int;
    if not exists (select 1 from teams where id = tid and league_id = lid) then raise exception 'A club in the import isn''t in this league'; end if;
    for p in select * from jsonb_array_elements(coalesce(c -> 'players', '[]')) loop
      pid := (p #>> '{}')::int;
      if pid = any (ids) then raise exception '% is on two clubs in the import', (select name from players where id = pid); end if;
      if not exists (select 1 from players where id = pid) then raise exception 'Unknown player in the import'; end if;
      ids := ids || pid;
    end loop;
  end loop;
  if p_replace then
    delete from ownership where league_id = lid;
    delete from squad where league_id = lid;
  elsif exists (select 1 from squad where league_id = lid and player_id = any (ids)) then
    raise exception 'Some of these players are already on a list';
  end if;
  for c in select * from jsonb_array_elements(coalesce(p_clubs, '[]')) loop
    tid := (c ->> 'team_id')::int; n_clubs := n_clubs + 1;
    nm := nullif(left(trim(coalesce(c ->> 'name', '')), 40), '');
    if nm is not null and char_length(nm) >= 2 then
      sc := upper(left(regexp_replace(nm, '[^A-Za-z0-9]', '', 'g'), 3));
      update teams set name = nm,
        short_code = case when char_length(sc) >= 2 and not exists (select 1 from teams o where o.league_id = lid and o.short_code = sc and o.id <> tid) then sc else short_code end
      where id = tid;
    end if;
    for p in select * from jsonb_array_elements(coalesce(c -> 'players', '[]')) loop
      pid := (p #>> '{}')::int;
      insert into squad (player_id, team_id, is_keeper, is_rookie_keeper, acquired_how, acquired_season, league_id)
      values (pid, tid, false, false, 'Imported', 2027, lid);
      insert into ownership (player_id, team_id, from_season, how, league_id) values (pid, tid, 2027, 'Imported', lid);
      n_players := n_players + 1;
    end loop;
  end loop;
  return json_build_object('clubs', n_clubs, 'players', n_players);
end $$;

revoke execute on function public.import_rosters(jsonb, boolean) from public, anon;
grant execute on function public.import_rosters(jsonb, boolean) to authenticated;
grant create on schema public to khq_definer;
alter function public.import_rosters(jsonb, boolean) owner to khq_definer;
revoke create on schema public from khq_definer;
