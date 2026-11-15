-- Rookie keeper slot, term deposits and loans.
--  - One cap-free rookie per club per keeper season: a player with 10 or fewer career games. His salary doesn't count
--    toward the cap (keeper or season) for that season.
--  - Term deposit: lock KT until season end, get it back with interest at rollover.
--  - Loans: lend KT to another club; it's repaid with interest at rollover.

alter table public.kc_contracts add column if not exists rookie_slot_season int;
create unique index if not exists kc_one_rookie_slot on public.kc_contracts (league_id, team_id, rookie_slot_season)
  where rookie_slot_season is not null and status in ('active', 'pending');
alter table public.kc_settings add column if not exists deposit_pct int not null default 10 check (deposit_pct between 0 and 50);
alter table public.kc_settings add column if not exists loan_max_pct int not null default 25 check (loan_max_pct between 0 and 100);

create table if not exists public.kc_deposits (
  id bigint generated always as identity primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  team_id int not null references public.teams(id) on delete cascade,
  amount int not null check (amount > 0), rate_pct int not null, season int not null,
  status text not null default 'open' check (status in ('open', 'paid')),
  created_at timestamptz not null default now()
);
create table if not exists public.kc_loans (
  id bigint generated always as identity primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  lender int not null references public.teams(id) on delete cascade,
  borrower int not null references public.teams(id) on delete cascade,
  amount int not null check (amount > 0), rate_pct int not null check (rate_pct between 0 and 100), season int not null,
  status text not null default 'offered' check (status in ('offered', 'active', 'repaid', 'declined', 'cancelled')),
  created_at timestamptz not null default now(), check (lender <> borrower)
);
do $$
declare t text;
begin
  foreach t in array array['kc_deposits', 'kc_loans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "league scope" on public.%I', t);
    execute format('create policy "league scope" on public.%I as restrictive for all using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()))', t);
    execute format('drop policy if exists "definer access" on public.%I', t);
    execute format('create policy "definer access" on public.%I for all to khq_definer using (true) with check (true)', t);
    execute format('drop policy if exists "%s: members read" on public.%I', t, t);
    execute format('create policy "%s: members read" on public.%I for select using ((select public.is_member()))', t, t);
  end loop;
end $$;

-- Salary for a season leaves out that season's rookie-slot contract.
create or replace function public.kc_salary(t int, s int) returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(salary_k) from kc_contracts where team_id = t and status in ('active', 'pending') and start_season <= s and end_season >= s
                     and rookie_slot_season is distinct from s and league_id = public.current_league()), 0)
        + coalesce((select sum(dead_k) from kc_contracts where team_id = t and dead_season = s and league_id = public.current_league()), 0))::int
$$;

-- Put a player in (or take him out of) the rookie slot for a keeper season: this season or next.
create or replace function public.kc_set_rookie_slot(pid int, p_season int, p_on boolean) returns text language plpgsql security definer set search_path = public as $$
declare k kc_settings; c kc_contracts; gms int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if p_season not in (k.season, k.season + 1) then raise exception 'Pick this season or next'; end if;
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

-- Term deposit: locked until rollover, then paid back with interest.
create or replace function public.kc_deposit(amount int) returns bigint language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); did bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if amount < 100 then raise exception 'The minimum deposit is 100 KT'; end if;
  if public.kc_bank(me) < amount then raise exception 'You have % KT', public.kc_bank(me); end if;
  perform public.kc_pay(me, -amount, 'Term deposit (locked to season end)');
  insert into kc_deposits (team_id, amount, rate_pct, season) values (me, amount, k.deposit_pct, k.season) returning id into did;
  return did;
end $$;

-- Loans: lender offers, borrower accepts (KT moves then), repaid with interest at rollover.
create or replace function public.kc_loan_offer(p_borrower int, amount int, p_rate int) returns bigint language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); lid bigint;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  if p_borrower = me then raise exception 'You can’t lend to yourself'; end if;
  if amount < 100 then raise exception 'The minimum loan is 100 KT'; end if;
  if p_rate < 0 or p_rate > k.loan_max_pct then raise exception 'Interest must be 0 to % percent', k.loan_max_pct; end if;
  if public.kc_bank(me) < amount then raise exception 'You have % KT', public.kc_bank(me); end if;
  insert into kc_loans (lender, borrower, amount, rate_pct, season) values (me, p_borrower, amount, p_rate, k.season) returning id into lid;
  return lid;
end $$;

create or replace function public.kc_loan_respond(lid bigint, p_accept boolean) returns text language plpgsql security definer set search_path = public as $$
declare l kc_loans; me int := public.my_team_id();
begin
  select * into l from kc_loans where id = lid and status = 'offered' and league_id = public.current_league() for update;
  if l is null then raise exception 'That loan offer isn’t open'; end if;
  if me = l.lender and not p_accept then update kc_loans set status = 'cancelled' where id = lid; return 'cancelled'; end if;
  if me is distinct from l.borrower and not public.is_commish() then raise exception 'Only the borrowing club can answer'; end if;
  if not p_accept then update kc_loans set status = 'declined' where id = lid; return 'declined'; end if;
  if public.kc_bank(l.lender) < l.amount then raise exception 'The lender no longer has the KT'; end if;
  perform public.kc_pay(l.lender, -l.amount, 'Loan to ' || (select short_code from teams where id = l.borrower));
  perform public.kc_pay(l.borrower, l.amount, 'Loan from ' || (select short_code from teams where id = l.lender));
  update kc_loans set status = 'active' where id = lid;
  return 'active';
end $$;

create or replace function public.kc_rollover() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; r record; n int := 0; bad text := ''; allow int;
begin
  if not public.is_commish() then raise exception 'Only the commish can roll the season over'; end if;
  select * into k from kc_settings where league_id = public.current_league() for update;
  if k.window_open then raise exception 'Close the window first'; end if;
  for r in select id, name from teams where league_id = public.current_league() and not coalesce(is_guest, false) loop
    allow := k.deficit_max_k;
    if exists (select 1 from kc_cap_adjust where team_id = r.id and season = k.season + 1 and league_id = public.current_league()) then allow := 0; end if;
    if public.kc_kept_count(r.id, k.season + 1) > 18
       or public.kc_salary(r.id, k.season + 1) > public.kc_keeper_cap(r.id, k.season + 1) + allow then
      bad := bad || r.name || ', ';
    end if;
  end loop;
  if bad <> '' then raise exception 'These clubs are over the keeper cap or keeper limit: %', left(bad, length(bad) - 2); end if;
  for r in select id from teams where league_id = public.current_league() and not coalesce(is_guest, false) loop
    if public.kc_salary(r.id, k.season + 1) > public.kc_keeper_cap(r.id, k.season + 1) then perform public.kc_lockin(r.id); end if;
  end loop;
  for r in select * from kc_contracts where status = 'active' and end_season <= k.season and league_id = public.current_league() loop
    update kc_contracts set status = 'expired', updated_at = now() where id = r.id;
    if not exists (select 1 from kc_contracts where player_id = r.player_id and status = 'pending' and league_id = public.current_league()) then
      insert into kc_free_agents (player_id, ex_team) values (r.player_id, r.team_id) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  -- Term deposits mature and loans are repaid (borrowers can go into the red).
  for r in select * from kc_deposits where status = 'open' and season <= k.season and league_id = public.current_league() loop
    perform public.kc_pay(r.team_id, r.amount + r.amount * r.rate_pct / 100, 'Term deposit matured (+' || r.rate_pct || '%)');
    update kc_deposits set status = 'paid' where id = r.id;
  end loop;
  for r in select * from kc_loans where status = 'active' and season <= k.season and league_id = public.current_league() loop
    perform public.kc_pay(r.borrower, -(r.amount + r.amount * r.rate_pct / 100), 'Loan repaid to ' || (select short_code from teams where id = r.lender));
    perform public.kc_pay(r.lender, r.amount + r.amount * r.rate_pct / 100, 'Loan repaid by ' || (select short_code from teams where id = r.borrower));
    update kc_loans set status = 'repaid' where id = r.id;
  end loop;
  update kc_loans set status = 'cancelled' where status = 'offered' and league_id = public.current_league();
  update kc_free_agents set kind = 'open', closes_at = null where status = 'open' and kind = 'pending' and league_id = public.current_league();
  update kc_contracts set status = 'active', updated_at = now() where status = 'pending' and start_season <= k.season + 1 and league_id = public.current_league();
  update kc_settings set season = k.season + 1, midseason_at = null, updated_at = now() where league_id = public.current_league();
  insert into kc_ledger (team_id, delta, reason)
  select id, k.start_kt, (k.season + 1) || ' starting bank' from teams where league_id = public.current_league() and not coalesce(is_guest, false);
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, 'Rolled over to ' || (k.season + 1) || ': ' || n || ' free agents');
  return n;
end $$;

-- 2027 rookie keepers go straight into the 2027 rookie slot.
update public.kc_contracts c set rookie_slot_season = k.season
  from public.kc_settings k, public.squad s, public.players p
 where k.league_id = c.league_id and s.player_id = c.player_id and s.team_id = c.team_id and p.id = c.player_id
   and s.is_rookie_keeper and coalesce(p.career_games, 0) <= 10 and c.status = 'active' and c.start_season <= k.season and c.end_season >= k.season;

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
