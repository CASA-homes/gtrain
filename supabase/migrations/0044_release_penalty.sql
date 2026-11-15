-- Releasing a player under contract: dead money of 50% of his salary this season and 20% for each later season left,
-- plus a KT fee of release_fee_pct (10%) of the remaining contract value.
alter table public.kc_settings add column if not exists release_fee_pct int not null default 10 check (release_fee_pct between 0 and 100);
create table if not exists public.kc_dead (
  id bigint generated always as identity primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  team_id int not null references public.teams(id) on delete cascade,
  player_id int not null,
  contract_id bigint references public.kc_contracts(id) on delete cascade,
  season int not null,
  amount_k int not null check (amount_k > 0)
);
alter table public.kc_dead enable row level security;
drop policy if exists "league scope" on public.kc_dead;
create policy "league scope" on public.kc_dead as restrictive for all using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
drop policy if exists "definer access" on public.kc_dead;
create policy "definer access" on public.kc_dead for all to khq_definer using (true) with check (true);
drop policy if exists "kc_dead: members read" on public.kc_dead;
create policy "kc_dead: members read" on public.kc_dead for select using ((select public.is_member()));

-- Later-season dead money (the first season stays on the contract as dead_k / dead_season).
create or replace function public.kc_salary(t int, s int) returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(salary_k) from kc_contracts where team_id = t and status in ('active', 'pending') and start_season <= s and end_season >= s
                     and rookie_slot_season is distinct from s and league_id = public.current_league()), 0)
        + coalesce((select sum(dead_k) from kc_contracts where team_id = t and dead_season = s and league_id = public.current_league()), 0)
        + coalesce((select sum(amount_k) from kc_dead where team_id = t and season = s and league_id = public.current_league()), 0))::int
$$;

create or replace function public.kc_release(cid bigint) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; yrs int; dead int; later int; fee int; y int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can release him'; end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s agreed to join another club at season end'; end if;
  if exists (select 1 from kc_claims where contract_id = c.id and status = 'pending') then raise exception 'His clause has been paid. Match it or let him go first'; end if;
  if exists (select 1 from kc_auctions where contract_id = c.id and status = 'open') then raise exception 'He''s up for auction. Cancel that first'; end if;
  yrs := greatest(1, c.end_season - greatest(c.start_season, k.season) + 1);
  dead := round(c.salary_k * 0.5);
  later := round(c.salary_k * 0.2);
  fee := round(c.salary_k * yrs * k.release_fee_pct / 100.0);
  if fee > 0 and public.kc_bank(c.team_id) < fee then raise exception 'Releasing him costs % KT (% of what''s left on his deal). You have %', fee, k.release_fee_pct || '%', public.kc_bank(c.team_id); end if;
  update kc_contracts set status = 'released', dead_k = dead, dead_season = k.season, updated_at = now() where id = c.id;
  if later > 0 then
    for y in k.season + 1 .. c.end_season loop
      insert into kc_dead (team_id, player_id, contract_id, season, amount_k) values (c.team_id, c.player_id, c.id, y, later);
    end loop;
  end if;
  if fee > 0 then perform public.kc_pay(c.team_id, -fee, 'Release fee: ' || public.kc_pname(c.player_id)); end if;
  update kc_contracts set status = 'voided', updated_at = now()
   where player_id = c.player_id and status = 'pending' and team_id = c.team_id and league_id = public.current_league();
  update kc_free_agents set kind = 'open', closes_at = case when k.window_open then k.window_closes_at else null end
   where player_id = c.player_id and status = 'open' and kind = 'pending' and league_id = public.current_league();
  insert into kc_free_agents (player_id, ex_team, closes_at) values (c.player_id, c.team_id, case when k.window_open then k.window_closes_at else null end)
    on conflict do nothing;
  perform public.kc_log(c.player_id, c.team_id, null, 'release', fee, 0, '$' || dead || 'k dead money' || case when yrs > 1 then ', then $' || later || 'k a year to ' || c.end_season else '' end || case when fee > 0 then ', ' || fee || ' KT fee' else '' end);
  return dead;
end $$;

-- Commish restore also clears later-season dead money.
create or replace function public.kc_admin_contract(cid bigint, p_action text, p_salary int default null, p_end int default null) returns text language plpgsql security definer set search_path = public as $$
declare c kc_contracts;
begin
  if not public.is_commish() then raise exception 'Only the commish can override contracts'; end if;
  select * into c from kc_contracts where id = cid and league_id = public.current_league() for update;
  if c is null then raise exception 'No such contract'; end if;
  if p_action = 'void' then
    update kc_contracts set status = 'voided', updated_at = now() where id = cid;
    perform public.kc_log(c.player_id, c.team_id, c.team_id, 'tier', 0, 0, 'Commish voided contract ($' || c.salary_k || 'k to ' || c.end_season || ')');
    return 'voided';
  elsif p_action = 'restore' then
    if exists (select 1 from kc_contracts where player_id = c.player_id and status = 'active' and id <> cid and league_id = public.current_league()) then
      raise exception 'He already has another active contract';
    end if;
    update kc_contracts set status = 'active', dead_k = 0, dead_season = null, updated_at = now() where id = cid;
    delete from kc_dead where contract_id = cid;
    update kc_free_agents set status = 'unsigned' where player_id = c.player_id and status = 'open' and league_id = public.current_league();
    perform public.kc_log(c.player_id, c.team_id, c.team_id, 'tier', 0, 0, 'Commish restored contract ($' || c.salary_k || 'k to ' || c.end_season || ')');
    return 'restored';
  elsif p_action = 'edit' then
    if p_salary is not null and (p_salary < 1 or p_salary > 6000) then raise exception 'Salary must be $1k to $6,000k'; end if;
    if p_end is not null and p_end < c.start_season then raise exception 'End season can''t be before %', c.start_season; end if;
    update kc_contracts set salary_k = coalesce(p_salary, salary_k), base_k = least(5000, coalesce(p_salary, base_k)),
           end_season = coalesce(p_end, end_season), updated_at = now() where id = cid;
    perform public.kc_log(c.player_id, c.team_id, c.team_id, 'tier', 0, 0, 'Commish edit: $' || coalesce(p_salary, c.salary_k) || 'k to ' || coalesce(p_end, c.end_season));
    return 'edited';
  end if;
  raise exception 'Unknown action';
end $$;

grant create on schema public to khq_definer;
alter function public.kc_salary(int, int) owner to khq_definer;
alter function public.kc_release(bigint) owner to khq_definer;
alter function public.kc_admin_contract(bigint, text, int, int) owner to khq_definer;
revoke create on schema public from khq_definer;
