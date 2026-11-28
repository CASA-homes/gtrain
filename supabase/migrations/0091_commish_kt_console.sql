-- 0091 · Commish KT console: give or take KT, rewind a term deposit or a loan, reset a club to the starting bank.
-- Every change is a ledger entry starting "Commish:", so it shows on the club's token record.
-- Fixes 0087: deposits only allowed 'open'/'paid', so the old reset failed. Rewound deposits are now 'rewound'.

alter table public.kc_deposits drop constraint if exists kc_deposits_status_check;
alter table public.kc_deposits add constraint kc_deposits_status_check check (status in ('open', 'paid', 'rewound'));
alter table public.kc_loans drop constraint if exists kc_loans_status_check;
alter table public.kc_loans add constraint kc_loans_status_check check (status in ('offered', 'active', 'repaid', 'declined', 'cancelled', 'rewound'));

-- Everything the console shows, for the commish only: each club's bank, open deposits, live loans and recent ledger.
create or replace function public.kc_commish_finances() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lg int := public.current_league();
begin
  if not public.is_commish() then raise exception 'Only the commish can see every club''s finances'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'code', t.short_code,
      'bank', (select coalesce(sum(delta), 0) from kc_ledger l where l.league_id = lg and l.team_id = t.id),
      'deposits', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'amount', d.amount, 'rate', d.rate_pct, 'months', d.term_months,
                     'matures', d.matures_at, 'at', d.created_at) order by d.created_at)
                   from kc_deposits d where d.league_id = lg and d.team_id = t.id and d.status = 'open'), '[]'),
      'loans', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'amount', o.amount, 'rate', o.rate_pct, 'status', o.status,
                     'lender', o.lender, 'borrower', o.borrower, 'at', o.created_at) order by o.created_at)
                   from kc_loans o where o.league_id = lg and o.status in ('offered', 'active') and (o.lender = t.id or o.borrower = t.id)), '[]'),
      'ledger', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
                     select jsonb_build_object('id', l.id, 'delta', l.delta, 'reason', l.reason, 'at', l.created_at) x
                       from kc_ledger l where l.league_id = lg and l.team_id = t.id order by l.created_at desc, l.id desc limit 15) z), '[]')
    ) order by t.name)
    from teams t where t.league_id = lg), '[]');
end $$;

-- Give (positive) or take (negative) KT, with a reason.
create or replace function public.kc_commish_adjust(t int, amount int, why text) returns text
language plpgsql security definer set search_path = public as $$
declare lg int := public.current_league();
begin
  if not public.is_commish() then raise exception 'Only the commish can give or take KT'; end if;
  if not exists (select 1 from teams where id = t and league_id = lg) then raise exception 'That club isn''t in this league'; end if;
  if amount is null or amount = 0 then raise exception 'Enter an amount'; end if;
  if why is null or length(trim(why)) = 0 then raise exception 'Give a reason'; end if;
  perform public.kc_pay(t, amount, left('Commish: ' || trim(why), 160));
  return format('%s %s KT.', case when amount > 0 then 'Gave' else 'Took' end, abs(amount));
end $$;

-- Rewind an open term deposit: the KT goes back to the club, no interest.
create or replace function public.kc_rewind_deposit(did bigint) returns text
language plpgsql security definer set search_path = public as $$
declare lg int := public.current_league(); d kc_deposits;
begin
  if not public.is_commish() then raise exception 'Only the commish can rewind a deposit'; end if;
  select * into d from kc_deposits where id = did and league_id = lg for update;
  if d.id is null then raise exception 'Deposit not found'; end if;
  if d.status <> 'open' then raise exception 'That deposit has already been paid out or rewound'; end if;
  update kc_deposits set status = 'rewound' where id = did;
  perform public.kc_pay(d.team_id, d.amount, format('Commish: term deposit rewound, %s KT back (no interest)', d.amount));
  return format('Deposit rewound: %s KT back.', d.amount);
end $$;

-- Rewind a loan: an offer is just cancelled; an active loan goes back to the lender from the borrower, no interest.
create or replace function public.kc_rewind_loan(lid bigint) returns text
language plpgsql security definer set search_path = public as $$
declare lg int := public.current_league(); o kc_loans; ln text; bn text;
begin
  if not public.is_commish() then raise exception 'Only the commish can rewind a loan'; end if;
  select * into o from kc_loans where id = lid and league_id = lg for update;
  if o.id is null then raise exception 'Loan not found'; end if;
  if o.status = 'offered' then
    update kc_loans set status = 'cancelled' where id = lid;
    return 'Loan offer cancelled.';
  end if;
  if o.status <> 'active' then raise exception 'That loan is already settled'; end if;
  select name into ln from teams where id = o.lender;
  select name into bn from teams where id = o.borrower;
  update kc_loans set status = 'rewound' where id = lid;
  perform public.kc_pay(o.lender, o.amount, format('Commish: loan to %s rewound, %s KT back', bn, o.amount));
  perform public.kc_pay(o.borrower, -o.amount, format('Commish: loan from %s rewound, %s KT returned', ln, o.amount));
  return format('Loan rewound: %s KT back to %s.', o.amount, ln);
end $$;

-- Reset a club to the starting bank: rewinds its open deposits and cancels loan offers (each on the record), then one
-- entry takes the bank to the starting KT. Refused while it has an active loan or KT held in a free-agent offer.
create or replace function public.kc_reset_finances(t int) returns text
language plpgsql security definer set search_path = public as $$
declare lg int := public.current_league(); start int; bal int; n_dep int := 0; d record;
begin
  if not public.is_commish() then raise exception 'Only the commish can reset a club''s finances'; end if;
  if not exists (select 1 from teams where id = t and league_id = lg) then raise exception 'That club isn''t in this league'; end if;
  if exists (select 1 from kc_loans where league_id = lg and status = 'active' and (lender = t or borrower = t)) then
    raise exception 'This club has an active loan. Rewind it first.';
  end if;
  if exists (select 1 from kc_offers where league_id = lg and team_id = t and status = 'tabled' and coalesce(sweet_kt, 0) > 0) then
    raise exception 'This club has KT held in a free-agent offer. Withdraw it first.';
  end if;
  for d in select id from kc_deposits where league_id = lg and team_id = t and status = 'open' loop
    perform public.kc_rewind_deposit(d.id); n_dep := n_dep + 1;
  end loop;
  update kc_loans set status = 'cancelled' where league_id = lg and status = 'offered' and (lender = t or borrower = t);
  select coalesce(start_kt, 1000) into start from kc_settings where league_id = lg;
  select coalesce(sum(delta), 0) into bal from kc_ledger where league_id = lg and team_id = t;
  perform public.kc_pay(t, start - bal, format('Commish: reset to the %s KT starting bank', start));
  return format('Bank reset to %s KT%s.', start, case when n_dep > 0 then format(' · %s deposit%s rewound', n_dep, case when n_dep > 1 then 's' else '' end) else '' end);
end $$;

grant create on schema public to khq_definer;
alter function public.kc_commish_finances() owner to khq_definer;
alter function public.kc_commish_adjust(int, int, text) owner to khq_definer;
alter function public.kc_rewind_deposit(bigint) owner to khq_definer;
alter function public.kc_rewind_loan(bigint) owner to khq_definer;
alter function public.kc_reset_finances(int) owner to khq_definer;
revoke create on schema public from khq_definer;
