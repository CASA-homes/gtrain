-- Bets & fines: automatic fine rules (applied when the commish locks a round), round-tagged fines,
-- and the league KT bank (fees collected league-wide) with commish-pledged prizes paid out to a club.

-- Fine rules ---------------------------------------------------------------------------------------
create table public.fine_rules (
  id serial primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  kind text not null check (kind in ('low_player', 'low_team', 'high_team', 'captain_under')),
  amount int not null check (amount between 1 and 1000),
  threshold int check (threshold between 0 and 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (league_id, kind)
);
alter table public.fine_rules enable row level security;
create policy "league scope" on public.fine_rules as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
create policy "members read" on public.fine_rules for select to authenticated using ((select public.is_member()));
create policy "commish manages fine rules" on public.fine_rules to authenticated using ((select public.is_commish())) with check ((select public.is_commish()));
create policy "definer access" on public.fine_rules to khq_definer using (true) with check (true);
grant select, insert, update, delete on public.fine_rules to authenticated;
grant usage on sequence public.fine_rules_id_seq to authenticated;

-- Fines: which round, which rule, and whether it's a prize paid out of the kitty.
alter table public.fines add column if not exists round int;
alter table public.fines add column if not exists rule_kind text;
alter table public.fines add column if not exists prize boolean not null default false;
create index if not exists fines_round on public.fines (league_id, season, round);

-- League bank prizes ------------------------------------------------------------------------------
create table public.bank_prizes (
  id serial primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  season int not null,
  label text not null check (char_length(label) between 3 and 80),
  kt int not null check (kt > 0),
  status text not null default 'pledged' check (status in ('pledged', 'paid', 'cancelled')),
  team_id int references public.teams(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.bank_prizes enable row level security;
create policy "league scope" on public.bank_prizes as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
create policy "members read" on public.bank_prizes for select to authenticated using ((select public.is_member()));
create policy "commish manages prizes" on public.bank_prizes to authenticated using ((select public.is_commish())) with check ((select public.is_commish()) and status <> 'paid');
create policy "definer access" on public.bank_prizes to khq_definer using (true) with check (true);
grant select, insert, update, delete on public.bank_prizes to authenticated;
grant usage on sequence public.bank_prizes_id_seq to authenticated;

-- What the league bank has collected, by source, and what it has paid out.
create or replace function public.kc_league_bank()
returns json language sql stable security definer set search_path = public as $$
  with lg as (select public.current_league() id),
  fees as (
    select case
             when reason like 'Deficit fee%' then 'deficit'
             when reason like 'Extension fee%' then 'extension'
             when reason like 'Release fee%' then 'release'
             when reason like 'Matched clause (burned)%' then 'burned'
           end src, -delta kt
      from kc_ledger, lg where league_id = lg.id and delta < 0
    union all
    select 'levy', levy_kt from kc_transfers, lg where league_id = lg.id and levy_kt > 0
  ),
  inflow as (select src, sum(kt)::int kt from fees where src is not null group by src),
  paid as (select coalesce(sum(kt), 0)::int kt from bank_prizes, lg where league_id = lg.id and status = 'paid'),
  pledged as (select coalesce(sum(kt), 0)::int kt from bank_prizes, lg where league_id = lg.id and status = 'pledged')
  select json_build_object(
    'sources', coalesce((select json_object_agg(src, kt) from inflow), '{}'::json),
    'collected', coalesce((select sum(kt) from inflow), 0),
    'paid', (select kt from paid),
    'pledged', (select kt from pledged),
    'balance', coalesce((select sum(kt) from inflow), 0) - (select kt from paid))
  where public.is_member()
$$;

-- Commish pays a pledged prize into a club's bank.
create or replace function public.bank_pay_prize(p_prize int, p_team int)
returns void language plpgsql security definer set search_path = public as $$
declare pz bank_prizes; bal int;
begin
  if not public.is_commish() then raise exception 'Only the commish can pay out league prizes'; end if;
  select * into pz from bank_prizes where id = p_prize and league_id = public.current_league() for update;
  if pz is null or pz.status <> 'pledged' then raise exception 'That prize isn''t open'; end if;
  if not exists (select 1 from teams where id = p_team and league_id = public.current_league() and not coalesce(is_guest, false)) then raise exception 'Pick a club in this league'; end if;
  bal := (public.kc_league_bank() ->> 'balance')::int;
  if bal < pz.kt then raise exception 'The league bank only has % KT', bal; end if;
  update bank_prizes set status = 'paid', team_id = p_team, paid_at = now() where id = p_prize;
  perform public.kc_pay(p_team, pz.kt, 'League prize: ' || pz.label);
end $$;

revoke execute on function public.kc_league_bank() from public, anon;
revoke execute on function public.bank_pay_prize(int, int) from public, anon;
grant execute on function public.kc_league_bank() to authenticated;
grant execute on function public.bank_pay_prize(int, int) to authenticated;
grant create on schema public to khq_definer;
alter function public.kc_league_bank() owner to khq_definer;
alter function public.bank_pay_prize(int, int) owner to khq_definer;
revoke create on schema public from khq_definer;
