-- Release clause = a share of market value at signing (standard 50%, high 100%), stored on the contract so it
-- doesn't drift with weekly value moves. Re-set when the clause level changes.
alter table public.kc_settings add column if not exists clause_std_pct int not null default 50 check (clause_std_pct between 10 and 500);
alter table public.kc_settings add column if not exists clause_high_pct int not null default 100 check (clause_high_pct between 10 and 1000);
alter table public.kc_settings add column if not exists deficit_fee_kt int not null default 2500 check (deficit_fee_kt between 0 and 100000);
update public.kc_settings set deficit_max_k = 20;
alter table public.kc_contracts add column if not exists clause_kt int;

create or replace function public.kc_clause_at(pid int, p_tier text, lid int) returns int language sql stable security definer set search_path = public as $$
  select case when p_tier = 'standard' then round(public.kc_rate(pid) * k.kt_per_k * k.clause_std_pct / 100.0)::int
              when p_tier = 'high' then round(public.kc_rate(pid) * k.kt_per_k * k.clause_high_pct / 100.0)::int end
    from kc_settings k where k.league_id = lid
$$;

create or replace function public.kc_contract_clause_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.clause_kt is null or tg_op = 'UPDATE' and new.tier is distinct from old.tier then
    new.clause_kt := public.kc_clause_at(new.player_id, new.tier, new.league_id);
  end if;
  return new;
end $$;
drop trigger if exists kc_contract_clause on public.kc_contracts;
create trigger kc_contract_clause before insert or update of tier on public.kc_contracts for each row execute function public.kc_contract_clause_trg();

update public.kc_contracts set clause_kt = public.kc_clause_at(player_id, tier, league_id) where status in ('active', 'pending');

create or replace function public.kc_clause(cid bigint) returns int language sql stable security definer set search_path = public as $$
  select case when c.tier in ('none', 'protected') or c.end_season <= k.season or public.kc_is_pending(c.player_id) then null
    else coalesce(c.clause_kt, public.kc_clause_at(c.player_id, c.tier, c.league_id)) end
    from kc_contracts c join kc_settings k on k.league_id = c.league_id
   where c.id = cid and c.league_id = public.current_league()
$$;

-- Deadline-day deficit: up to deficit_max_k ($20k) over, for a deficit_fee_kt (2,500 KT) fee. Next year's keeper cap
-- still drops by the amount. More than that and the commish releases players.
create or replace function public.kc_lockin(t int) returns text language plpgsql security definer set search_path = public as $$
declare k kc_settings; s int; sal int; cap int; over int; kept int;
begin
  if t is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only the club can lock in its keepers'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  s := k.season + 1;
  kept := public.kc_kept_count(t, s);
  if kept > 18 then raise exception 'You''re keeping % players. The most is 17 + 1 rookie', kept; end if;
  sal := public.kc_salary(t, s); cap := public.kc_keeper_cap(t, s); over := sal - cap;
  if over <= 0 then return 'ok'; end if;
  if over > k.deficit_max_k then raise exception '$%k over the keeper cap. The most you can carry is $%k: release, trade or sell a player, or the commish will release one', over, k.deficit_max_k; end if;
  if exists (select 1 from kc_cap_adjust where team_id = t and season = s and league_id = public.current_league()) then
    raise exception 'You ran a deficit last year, so you can''t run one again';
  end if;
  perform public.kc_pay(t, -k.deficit_fee_kt, 'Deficit fee: $' || over || 'k over for ' || s);
  insert into kc_cap_adjust (team_id, season, amount_k, reason) values (t, s + 1, over, s || ' deficit')
    on conflict (league_id, team_id, season) do update set amount_k = excluded.amount_k;
  perform public.kc_log(null::int, t, t, 'deficit', k.deficit_fee_kt, 0, '$' || over || 'k deficit for ' || s || ' (' || k.deficit_fee_kt || ' KT fee): ' || (s + 1) || ' keeper cap drops by that');
  return 'deficit';
end $$;

-- Commish overrides on a contract: void it, restore a released one, or edit salary / end season.
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
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and p.proname like 'kc\_%' loop
    execute format('alter function %s owner to khq_definer', f.sig);
  end loop;
end $$;
revoke create on schema public from khq_definer;
revoke execute on function public.kc_contract_clause_trg() from public, anon, authenticated;
