-- 1 KT = $1k. Every KT amount divided by 50 so the economy keeps its proportions.
create table if not exists public.kc_ledger_backup_20261116 as select * from public.kc_ledger;
alter table public.kc_ledger_backup_20261116 enable row level security;

alter table public.kc_settings alter column tax_kt_per_k type numeric using tax_kt_per_k::numeric;
update public.kc_settings set kt_per_k = 1, start_kt = round(start_kt / 50.0), deficit_fee_kt = round(deficit_fee_kt / 50.0), tax_kt_per_k = tax_kt_per_k / 50.0;

update public.kc_ledger set delta = round(delta / 50.0);
update public.kc_deposits set amount = greatest(1, round(amount / 50.0));
update public.kc_loans set amount = greatest(1, round(amount / 50.0));
update public.kc_offers set sweet_kt = round(sweet_kt / 50.0);
update public.kc_claims set price_kt = greatest(1, round(price_kt / 50.0));
update public.kc_auctions set reserve_kt = round(reserve_kt / 50.0), price_kt = round(price_kt / 50.0);
update public.kc_bids set amount_kt = greatest(1, round(amount_kt / 50.0));
update public.desk_items set kt = greatest(1, round(kt / 50.0)) where kt is not null;
update public.kc_transfers set fee_kt = round(fee_kt / 50.0), levy_kt = round(levy_kt / 50.0);
update public.kc_contracts set clause_kt = public.kc_clause_at(player_id, tier, league_id) where status in ('active', 'pending');

-- Offer score: tokens now count 1:1 with salary ($1k = 1 KT).
create or replace function public.kc_offer_score(years int, salary_k int, sweet_kt int, pick_ids int[]) returns int language sql stable security definer set search_path = public as $$
  select (years * salary_k + coalesce(sweet_kt, 0)
    + coalesce((select sum(round(3000 * exp(-0.07 * (coalesce(overall, (round - 1) * 10 + 5) - 1)) / 50)) from picks where id = any(pick_ids)), 0))::int
$$;

create or replace function public.kc_deposit(amount int) returns bigint language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); did bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if amount < 2 then raise exception 'The minimum deposit is 2 KT'; end if;
  if public.kc_bank(me) < amount then raise exception 'You have % KT', public.kc_bank(me); end if;
  perform public.kc_pay(me, -amount, 'Term deposit (locked to season end)');
  insert into kc_deposits (team_id, amount, rate_pct, season) values (me, amount, k.deposit_pct, k.season) returning id into did;
  return did;
end $$;

create or replace function public.kc_loan_offer(p_borrower int, amount int, p_rate int) returns bigint language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); lid bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if p_borrower = me then raise exception 'You can’t lend to yourself'; end if;
  if amount < 2 then raise exception 'The minimum loan is 2 KT'; end if;
  if p_rate < 0 or p_rate > k.loan_max_pct then raise exception 'Interest must be 0 to % percent', k.loan_max_pct; end if;
  if public.kc_bank(me) < amount then raise exception 'You have % KT', public.kc_bank(me); end if;
  insert into kc_loans (lender, borrower, amount, rate_pct, season) values (me, p_borrower, amount, p_rate, k.season) returning id into lid;
  return lid;
end $$;

grant create on schema public to khq_definer;
alter function public.kc_offer_score(int, int, int, int[]) owner to khq_definer;
alter function public.kc_deposit(int) owner to khq_definer;
alter function public.kc_loan_offer(int, int, int) owner to khq_definer;
revoke create on schema public from khq_definer;
