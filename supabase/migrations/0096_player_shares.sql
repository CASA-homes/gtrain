-- 0096 · Player shares on the Trademarket.
--
--   • A share costs the player's market value in KT (1 KT = $1k), so a $57k player is 57 KT a share. Shares never touch
--     the salary cap.
--   • Each player has a fixed number of shares in the league (share_supply, default 10) and a club can hold at most
--     share_max_club of them (default 3), so at least four clubs can own a piece of anyone.
--   • Buying costs a share_fee_pct fee (default 10%) on top. Selling sells back to the league at the market value, less
--     a share_fee_pct fee and a share_tax_pct tax (default 10%) on any profit over what he paid, fee included.
--     Fees and tax leave the economy ("to the league") and are kept on the trade record.
--   • A player can't be bought until he's played share_lock_games AFL games (default 30).
--   • A club can have at most share_limit_pct (default 40%) of its KT in shares: what it paid for shares held, against
--     bank + that.
--   • Whole KT: fees and tax round up, so the sum always balances.

alter table public.kc_settings
  add column if not exists shares_open boolean not null default true,
  add column if not exists share_supply int not null default 10 check (share_supply between 1 and 100),
  add column if not exists share_max_club int not null default 3 check (share_max_club between 1 and 100),
  add column if not exists share_fee_pct int not null default 10 check (share_fee_pct between 0 and 50),
  add column if not exists share_tax_pct int not null default 10 check (share_tax_pct between 0 and 100),
  add column if not exists share_limit_pct int not null default 40 check (share_limit_pct between 0 and 100),
  add column if not exists share_lock_games int not null default 30 check (share_lock_games between 0 and 200);

-- What each club holds: shares and what it paid for them (fees included).
create table if not exists public.kc_shares (
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  team_id int not null references public.teams(id) on delete cascade,
  player_id int not null references public.players(id) on delete cascade,
  qty int not null check (qty > 0),
  cost_kt int not null check (cost_kt >= 0),
  updated_at timestamptz not null default now(),
  primary key (league_id, team_id, player_id)
);
-- Every buy and sell.
create table if not exists public.kc_share_trades (
  id bigint generated always as identity primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  team_id int not null references public.teams(id) on delete cascade,
  player_id int not null references public.players(id) on delete cascade,
  side text not null check (side in ('buy', 'sell', 'rewind')),
  qty int not null check (qty > 0),
  price_kt int not null,
  gross_kt int not null,
  fee_kt int not null default 0,
  tax_kt int not null default 0,
  net_kt int not null,          -- what moved in the bank: paid (buy) or received (sell)
  basis_kt int,                 -- sell: what those shares had cost
  created_at timestamptz not null default now()
);
create index if not exists kc_share_trades_team on public.kc_share_trades (league_id, team_id, created_at desc);

alter table public.kc_shares enable row level security;
alter table public.kc_share_trades enable row level security;
drop policy if exists "league scope" on public.kc_shares;
drop policy if exists "league scope" on public.kc_share_trades;
drop policy if exists "members read" on public.kc_shares;
drop policy if exists "members read" on public.kc_share_trades;
drop policy if exists "definer access" on public.kc_shares;
drop policy if exists "definer access" on public.kc_share_trades;
create policy "league scope" on public.kc_shares as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
create policy "league scope" on public.kc_share_trades as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
-- Who owns what is public inside the league.
create policy "members read" on public.kc_shares for select to authenticated using ((select public.is_member()));
create policy "members read" on public.kc_share_trades for select to authenticated using ((select public.is_member()));
create policy "definer access" on public.kc_shares for all to khq_definer using (true) with check (true);
create policy "definer access" on public.kc_share_trades for all to khq_definer using (true) with check (true);
grant select on public.kc_shares, public.kc_share_trades to authenticated;
grant all on public.kc_shares, public.kc_share_trades to khq_definer;

-- A player's share facts for this league: price, sold, games, locked.
create or replace function public.kc_share_quote(pid int)
returns table(price_kt int, sold int, supply int, max_club int, mine int, games int, lock_games int, fee_pct int, tax_pct int,
              bank int, held_cost int, limit_pct int, room_kt int, open boolean)
language sql stable security definer set search_path = public as $$
  with k as (select * from kc_settings where league_id = public.current_league()),
  me as (select public.my_team_id() t),
  held as (select coalesce(sum(cost_kt), 0)::int c from kc_shares s, me where s.team_id = me.t and s.league_id = public.current_league())
  select coalesce((select rate_k from kc_rate_cache r where r.league_id = public.current_league() and r.player_id = pid), 10),
         coalesce((select sum(qty) from kc_shares s where s.player_id = pid and s.league_id = public.current_league()), 0)::int,
         k.share_supply, k.share_max_club,
         coalesce((select qty from kc_shares s, me where s.player_id = pid and s.team_id = me.t and s.league_id = public.current_league()), 0),
         coalesce((select career_games from players where id = pid), 0),
         k.share_lock_games, k.share_fee_pct, k.share_tax_pct,
         public.kc_bank((select t from me)), held.c, k.share_limit_pct,
         greatest(0, floor((public.kc_bank((select t from me)) + held.c) * k.share_limit_pct / 100.0)::int - held.c),
         k.shares_open
    from k, held
$$;

create or replace function public.kc_share_buy(pid int, n int) returns int
language plpgsql security definer set search_path = public as $$
declare k kc_settings; me int := public.my_team_id(); q record; gross int; fee int; total int; nm text;
begin
  if me is null then raise exception 'Sign in as a coach to buy shares'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  if not k.shares_open then raise exception 'The share market is closed'; end if;
  if n is null or n < 1 then raise exception 'Pick how many shares'; end if;
  -- One buyer at a time per player, so two clubs can't take the last share together.
  perform pg_advisory_xact_lock(hashtext('kc_shares'), pid);
  select * into q from public.kc_share_quote(pid);
  select coalesce(full_name, name) into nm from players where id = pid;
  if nm is null then raise exception 'No such player'; end if;
  if q.games < q.lock_games then raise exception '% has played % of % games. Shares open at %.', nm, q.games, q.lock_games, q.lock_games; end if;
  if q.sold + n > q.supply then raise exception 'Only % of % shares left', q.supply - q.sold, q.supply; end if;
  if q.mine + n > q.max_club then raise exception 'A club can hold at most % shares in one player (you have %)', q.max_club, q.mine; end if;
  gross := q.price_kt * n;
  fee := ceil(gross * q.fee_pct / 100.0)::int;
  total := gross + fee;
  if q.bank < total then raise exception 'That costs % KT and you have % KT', total, q.bank; end if;
  if total > q.room_kt then raise exception '%', 'That would put more than ' || q.limit_pct || '% of your KT in shares. You can invest ' || q.room_kt || ' KT more.'; end if;
  perform public.kc_pay(me, -total, 'Shares: bought ' || n || ' × ' || nm || ' at ' || q.price_kt || ' KT' || case when fee > 0 then ' (+' || fee || ' fee)' else '' end);
  insert into kc_shares (team_id, player_id, qty, cost_kt) values (me, pid, n, total)
    on conflict (league_id, team_id, player_id) do update set qty = kc_shares.qty + excluded.qty, cost_kt = kc_shares.cost_kt + excluded.cost_kt, updated_at = now();
  insert into kc_share_trades (team_id, player_id, side, qty, price_kt, gross_kt, fee_kt, tax_kt, net_kt)
    values (me, pid, 'buy', n, q.price_kt, gross, fee, 0, total);
  return total;
end $$;

create or replace function public.kc_share_sell(pid int, n int) returns int
language plpgsql security definer set search_path = public as $$
declare me int := public.my_team_id(); h kc_shares; k kc_settings; price int; gross int; fee int; basis int; tax int; net int; nm text;
begin
  if me is null then raise exception 'Sign in as a coach to sell shares'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  select * into h from kc_shares where team_id = me and player_id = pid and league_id = public.current_league() for update;
  if h is null then raise exception 'You don''t own shares in him'; end if;
  if n is null or n < 1 or n > h.qty then raise exception 'You own % share%', h.qty, case when h.qty = 1 then '' else 's' end; end if;
  select coalesce(full_name, name) into nm from players where id = pid;
  price := coalesce((select rate_k from kc_rate_cache r where r.league_id = public.current_league() and r.player_id = pid), 10);
  gross := price * n;
  basis := case when n = h.qty then h.cost_kt else round(h.cost_kt::numeric * n / h.qty)::int end;
  fee := ceil(gross * k.share_fee_pct / 100.0)::int;
  tax := ceil(greatest(0, gross - basis) * k.share_tax_pct / 100.0)::int;
  net := greatest(0, gross - fee - tax);
  perform public.kc_pay(me, net, 'Shares: sold ' || n || ' × ' || nm || ' at ' || price || ' KT'
    || case when fee + tax > 0 then ' (−' || fee || ' fee' || case when tax > 0 then ', −' || tax || ' gains tax' else '' end || ')' else '' end);
  if n = h.qty then delete from kc_shares where team_id = me and player_id = pid and league_id = public.current_league();
  else update kc_shares set qty = qty - n, cost_kt = cost_kt - basis, updated_at = now() where team_id = me and player_id = pid and league_id = public.current_league();
  end if;
  insert into kc_share_trades (team_id, player_id, side, qty, price_kt, gross_kt, fee_kt, tax_kt, net_kt, basis_kt)
    values (me, pid, 'sell', n, price, gross, fee, tax, net, basis);
  return net;
end $$;

-- Commish: undo a club's holding in a player, refunding what it paid. Shows on the token record.
create or replace function public.kc_share_rewind(p_team int, pid int) returns int
language plpgsql security definer set search_path = public as $$
declare h kc_shares; nm text;
begin
  if not public.is_commish() then raise exception 'Commish only'; end if;
  select * into h from kc_shares where team_id = p_team and player_id = pid and league_id = public.current_league() for update;
  if h is null then raise exception 'That club holds no shares in him'; end if;
  select coalesce(full_name, name) into nm from players where id = pid;
  perform public.kc_pay(p_team, h.cost_kt, 'Commish: shares in ' || nm || ' rewound (' || h.qty || ' × refunded at cost)');
  delete from kc_shares where team_id = p_team and player_id = pid and league_id = public.current_league();
  insert into kc_share_trades (team_id, player_id, side, qty, price_kt, gross_kt, net_kt, basis_kt)
    values (p_team, pid, 'rewind', h.qty, 0, h.cost_kt, h.cost_kt, h.cost_kt);
  return h.cost_kt;
end $$;

revoke execute on function public.kc_share_quote(int), public.kc_share_buy(int, int), public.kc_share_sell(int, int), public.kc_share_rewind(int, int) from anon, public;
grant execute on function public.kc_share_quote(int), public.kc_share_buy(int, int), public.kc_share_sell(int, int), public.kc_share_rewind(int, int) to authenticated;
grant create on schema public to khq_definer;
alter function public.kc_share_quote(int) owner to khq_definer;
alter function public.kc_share_buy(int, int) owner to khq_definer;
alter function public.kc_share_sell(int, int) owner to khq_definer;
alter function public.kc_share_rewind(int, int) owner to khq_definer;
revoke create on schema public from khq_definer;
