-- Rookie slot: current season only, locked from player drop day (set by the commish).
alter table public.kc_settings add column if not exists rookie_lock_at timestamptz;

-- Future-season slots no longer exist.
update public.kc_contracts c set rookie_slot_season = null
  from public.kc_settings k where k.league_id = c.league_id and c.rookie_slot_season > k.season;

create or replace function public.kc_set_rookie_slot(pid int, p_season int, p_on boolean) returns text language plpgsql security definer set search_path = public as $$
declare k kc_settings; c kc_contracts; gms int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if p_season <> k.season then raise exception 'The rookie slot is set for the current season (%) only', k.season; end if;
  if k.rookie_lock_at is not null and now() >= k.rookie_lock_at and not public.is_commish() then
    raise exception 'Rookie slots locked on player drop day (%)', to_char(k.rookie_lock_at at time zone 'Australia/Perth', 'DD Mon');
  end if;
  select * into c from kc_contracts where player_id = pid and status in ('active', 'pending') and start_season <= p_season and end_season >= p_season
     and league_id = public.current_league() order by start_season desc limit 1 for update;
  if c is null then raise exception 'He needs a contract that covers %', p_season; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can do that'; end if;
  if not p_on then
    update kc_contracts set rookie_slot_season = null, updated_at = now() where id = c.id;
    return 'cleared';
  end if;
  select coalesce(career_games, 0) into gms from players where id = pid;
  if gms > 10 then raise exception 'Rookie slot is for players with 10 or fewer games (he has %)', gms; end if;
  update kc_contracts set rookie_slot_season = null, updated_at = now()
   where team_id = c.team_id and rookie_slot_season = p_season and league_id = public.current_league();
  update kc_contracts set rookie_slot_season = p_season, updated_at = now() where id = c.id;
  perform public.kc_log(pid, c.team_id, c.team_id, 'tier', 0, 0, 'Rookie slot for ' || p_season || ': cap-free');
  return 'set';
end $$;

grant create on schema public to khq_definer;
alter function public.kc_set_rookie_slot(int, int, boolean) owner to khq_definer;
revoke create on schema public from khq_definer;
