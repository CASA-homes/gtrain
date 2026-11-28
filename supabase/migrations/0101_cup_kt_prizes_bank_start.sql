-- 0101 · Knockout Cup KT prizes and the league bank's starting balance.
--
--   • The commish can put KT up for the cup winner and runner-up (cup_settings.winner_kt / runner_kt). Each is an
--     allocation in the league bank (bank_prizes, ref 'cup:<season>:winner|runner'), paid out when the cup is awarded
--     and handed back if the award is undone. Pick prizes stay optional (prizes_on).
--   • The league bank starts with leagues.settings.rules.bank_start_kt KT (default 100), shown as its own source.

alter table public.cup_settings add column if not exists winner_kt int not null default 0 check (winner_kt >= 0);
alter table public.cup_settings add column if not exists runner_kt int not null default 0 check (runner_kt >= 0);
alter table public.bank_prizes add column if not exists ref text;
create unique index if not exists bank_prizes_ref on public.bank_prizes (league_id, ref) where ref is not null and status <> 'cancelled';

create or replace function public.cup_award_prizes(season_in integer, winner integer, runner integer)
returns void language plpgsql security definer set search_path = public as $$
declare cs cup_settings; pz bank_prizes;
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  select * into cs from cup_settings c where c.season = season_in for update;
  if cs.season is null then raise exception 'No Cup settings for %', season_in; end if;
  if not cs.prizes_on and cs.winner_kt = 0 and cs.runner_kt = 0 then raise exception 'There are no Cup prizes switched on'; end if;
  if cs.awarded_at is not null then raise exception 'The Cup prizes have already been awarded'; end if;
  if winner is null or runner is null or winner = runner then raise exception 'The final isn''t decided yet'; end if;
  if cs.prizes_on then
    insert into picks (year, round, overall, original_team_id, owner_team_id, kind, bonus, slot_first)
    values (season_in + 1, cs.winner_round, null, winner, winner, 'draft', 'Cup winner ' || season_in, true),
           (season_in + 1, cs.runner_round, null, runner, runner, 'draft', 'Cup runner-up ' || season_in, true);
  end if;
  -- KT prizes: pay each allocation from the league bank.
  for pz in select * from bank_prizes where league_id = public.current_league() and status = 'pledged'
             and ref in ('cup:' || season_in || ':winner', 'cup:' || season_in || ':runner') for update loop
    update bank_prizes set status = 'paid', team_id = case when pz.ref like '%:winner' then winner else runner end, paid_at = now() where id = pz.id;
    perform public.kc_pay(case when pz.ref like '%:winner' then winner else runner end, pz.kt, 'League prize: ' || pz.label);
  end loop;
  update cup_settings set awarded_at = now(), winner_team = winner, runner_team = runner, updated_at = now() where season = season_in;
end $$;

create or replace function public.cup_unaward_prizes(season_in integer)
returns void language plpgsql security definer set search_path = public as $$
declare pz bank_prizes;
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  if exists (select 1 from draft_room_picks d join picks p on p.id = d.pick_id where p.bonus in ('Cup winner ' || season_in, 'Cup runner-up ' || season_in))
    then raise exception 'A Cup pick has already been used in the draft'; end if;
  delete from picks where year = season_in + 1 and bonus in ('Cup winner ' || season_in, 'Cup runner-up ' || season_in);
  for pz in select * from bank_prizes where league_id = public.current_league() and status = 'paid'
             and ref in ('cup:' || season_in || ':winner', 'cup:' || season_in || ':runner') for update loop
    perform public.kc_pay(pz.team_id, -pz.kt, 'League prize undone: ' || pz.label);
    update bank_prizes set status = 'pledged', team_id = null, paid_at = null where id = pz.id;
  end loop;
  update cup_settings set awarded_at = null, winner_team = null, runner_team = null, updated_at = now() where season = season_in;
end $$;

create or replace function public.kc_league_bank()
returns json language sql stable security definer set search_path = public as $$
  with lg as (select l.id, l.created_at born, coalesce((l.settings -> 'rules' ->> 'bank_start_kt')::int, 100) start_kt
                from leagues l where l.id = public.current_league()),
  fees as (
    select 'start' src, lg.start_kt kt, lg.born at from lg where lg.start_kt > 0
    union all
    select case
             when reason like 'Deficit fee%' then 'deficit'
             when reason like 'Extension fee%' then 'extension'
             when reason like 'Release fee%' then 'release'
             when reason like 'Matched clause (burned)%' then 'burned'
           end src, -delta kt, created_at at
      from kc_ledger, lg where league_id = lg.id and delta < 0
    union all
    select 'levy', levy_kt, created_at from kc_transfers, lg where league_id = lg.id and levy_kt > 0
    union all
    select 'games', cut_kt, coalesce(settled_at, created_at) from kt_pots, lg where league_id = lg.id and status = 'paid' and cut_kt > 0
    union all
    select 'shares', fee_kt + tax_kt, created_at from kc_share_trades, lg where league_id = lg.id and side in ('buy', 'sell') and fee_kt + tax_kt > 0
  ),
  flows as (
    select at, kt from fees where src is not null
    union all
    select coalesce(paid_at, created_at), -kt from bank_prizes, lg where league_id = lg.id and status = 'paid'
  ),
  daily as (select (at at time zone 'Australia/Perth')::date d, sum(kt)::int kt from flows group by 1),
  hist as (select d, sum(kt) over (order by d)::int bal from daily),
  inflow as (select src, sum(kt)::int kt from fees where src is not null group by src),
  paid as (select coalesce(sum(kt), 0)::int kt from bank_prizes, lg where league_id = lg.id and status = 'paid'),
  pledged as (select coalesce(sum(kt), 0)::int kt from bank_prizes, lg where league_id = lg.id and status = 'pledged')
  select json_build_object(
    'sources', coalesce((select json_object_agg(src, kt) from inflow), '{}'::json),
    'collected', coalesce((select sum(kt) from inflow where src <> 'start'), 0),
    'start', coalesce((select kt from inflow where src = 'start'), 0),
    'paid', (select kt from paid),
    'pledged', (select kt from pledged),
    'balance', coalesce((select sum(kt) from inflow), 0) - (select kt from paid),
    'history', coalesce((select json_agg(json_build_array(d, bal) order by d) from hist), '[]'::json))
  where public.is_member()
$$;
