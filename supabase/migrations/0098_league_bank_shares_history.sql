-- 0098 · League bank: share fees and gains tax count as collected, and the bank returns its balance over time
-- (one point per day anything moved) for the growth chart on League settings.

create or replace function public.kc_league_bank()
returns json language sql stable security definer set search_path = public as $$
  with lg as (select public.current_league() id),
  fees as (
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
    'collected', coalesce((select sum(kt) from inflow), 0),
    'paid', (select kt from paid),
    'pledged', (select kt from pledged),
    'balance', coalesce((select sum(kt) from inflow), 0) - (select kt from paid),
    'history', coalesce((select json_agg(json_build_array(d, bal) order by d) from hist), '[]'::json))
  where public.is_member()
$$;
