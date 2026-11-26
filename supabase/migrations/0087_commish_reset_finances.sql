-- 0087 · Commish: reset a club's finances to the starting bank.
-- Cancels the club's open term deposits and loan offers (no interest paid), then one ledger entry takes the bank back
-- to this league's starting KT. Refused while the club has an active loan with another club or KT held in a tabled
-- free-agent offer, so no other club's money is touched. Contracts, picks and the ledger history stay as they are.

create or replace function public.kc_reset_finances(t int) returns text
language plpgsql security definer set search_path = public as $$
declare lg int := public.current_league(); start int; bal int; n_dep int; n_loan int;
begin
  if not public.is_commish() then raise exception 'Only the commish can reset a club''s finances'; end if;
  if not exists (select 1 from teams where id = t and league_id = lg) then raise exception 'That club isn''t in this league'; end if;
  if exists (select 1 from kc_loans where league_id = lg and status = 'active' and (lender = t or borrower = t)) then
    raise exception 'This club has an active loan with another club. Settle it first.';
  end if;
  if exists (select 1 from kc_offers where league_id = lg and team_id = t and status = 'tabled' and coalesce(sweet_kt, 0) > 0) then
    raise exception 'This club has KT held in a free-agent offer. Withdraw it first.';
  end if;

  update kc_deposits set status = 'cancelled' where league_id = lg and team_id = t and status = 'open';
  get diagnostics n_dep = row_count;
  update kc_loans set status = 'cancelled' where league_id = lg and status = 'offered' and (lender = t or borrower = t);
  get diagnostics n_loan = row_count;

  select coalesce(start_kt, 1000) into start from kc_settings where league_id = lg;
  select coalesce(sum(delta), 0) into bal from kc_ledger where league_id = lg and team_id = t;
  perform public.kc_pay(t, start - bal, 'Commish reset: back to the ' || start || ' KT starting bank');
  return format('Bank reset to %s KT%s%s.', start,
    case when n_dep > 0 then format(' · %s deposit%s cancelled', n_dep, case when n_dep > 1 then 's' else '' end) else '' end,
    case when n_loan > 0 then format(' · %s loan offer%s cancelled', n_loan, case when n_loan > 1 then 's' else '' end) else '' end);
end $$;

grant create on schema public to khq_definer;
alter function public.kc_reset_finances(int) owner to khq_definer;
revoke create on schema public from khq_definer;
