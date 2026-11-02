-- Battle desk: custom mini games, club-v-club challenges with stakes, and token cash.
-- Run in the Supabase SQL editor after 0017. Safe to run more than once.

-- 1. Custom games: settings live on the game (mode, formation, matches, captaincy).
--    settings = { mode: 'total'|'duels', per: int, formation: {DEF,MID,RUC,FWD}, matches: int[], captain: bool, vc: bool, triple: bool }
alter table mini_games add column if not exists settings jsonb;
alter table mini_games drop constraint if exists mini_games_kind_check;
alter table mini_games add constraint mini_games_kind_check check (kind in ('snake11', 'cap5', 'duel5', 'custom'));

create or replace function public.mini_per(g mini_games) returns int language sql immutable as $$
  select case g.kind when 'duel5' then 5 when 'custom' then coalesce((g.settings->>'per')::int, 5) else 11 end
$$;

create or replace function public.mini_pick_check() returns trigger language plpgsql security definer set search_path = public as $$
declare g mini_games; n int; cnt int; r int; i int; expected int; used int; lim int; per int;
begin
  select * into g from mini_games where id = new.game_id for update;
  if g is null or g.status <> 'drafting' then raise exception 'The draft is closed'; end if;
  per := public.mini_per(g);
  select count(*) into cnt from mini_picks where game_id = new.game_id;
  n := array_length(g.draft_order, 1);
  if cnt >= n * per then raise exception 'The draft is full'; end if;
  if new.pick_no <> cnt then raise exception 'Someone else just picked. Try again.'; end if;
  r := cnt / n; i := cnt % n;
  expected := case when r % 2 = 0 then g.draft_order[i + 1] else g.draft_order[n - i] end;
  if new.team_id <> expected then raise exception 'It is not this club''s turn'; end if;
  if g.kind = 'snake11' or (g.kind = 'custom' and coalesce(g.settings->>'mode', 'total') = 'total') then
    lim := case when g.kind = 'custom' then coalesce((g.settings->'formation'->>new.slot)::int, 0)
                else case new.slot when 'DEF' then 3 when 'MID' then 4 when 'RUC' then 1 else 3 end end;
    select count(*) into used from mini_picks where game_id = new.game_id and team_id = new.team_id and slot = new.slot;
    if used >= lim then raise exception 'No % spot left', new.slot; end if;
  end if;
  return new;
end $$;

create or replace function public.mini_pick_after() returns trigger language plpgsql security definer set search_path = public as $$
declare g mini_games; cnt int;
begin
  if tg_op = 'INSERT' then
    select * into g from mini_games where id = new.game_id;
    select count(*) into cnt from mini_picks where game_id = new.game_id;
    if cnt >= array_length(g.draft_order, 1) * public.mini_per(g) then update mini_games set status = 'done', finished_at = now() where id = new.game_id; end if;
  else
    update mini_games set status = 'drafting', finished_at = null where id = old.game_id and status = 'done';
  end if;
  return null;
end $$;

-- Captain and vice-captain per club per custom game.
create table if not exists mini_roles (
  game_id bigint not null references mini_games(id) on delete cascade,
  team_id int not null references teams(id) on delete cascade,
  captain int, vc int,
  updated_at timestamptz not null default now(),
  primary key (game_id, team_id)
);
alter table mini_roles enable row level security;
drop policy if exists "mini_roles: members read" on mini_roles;
create policy "mini_roles: members read" on mini_roles for select using (public.is_member());
drop policy if exists "mini_roles: own club or commish" on mini_roles;
create policy "mini_roles: own club or commish" on mini_roles for all using (team_id = public.my_team_id() or public.is_commish())
  with check (team_id = public.my_team_id() or public.is_commish());

-- 2. Token cash. A ledger, so every token is accounted for. Balance = sum(delta).
create table if not exists token_ledger (
  id bigint generated always as identity primary key,
  team_id int not null references teams(id) on delete cascade,
  delta int not null,
  reason text not null check (length(reason) between 1 and 120),
  challenge_id bigint,
  created_at timestamptz not null default now()
);
create index if not exists token_ledger_team on token_ledger (team_id);
alter table token_ledger enable row level security;
drop policy if exists "token_ledger: members read" on token_ledger;
create policy "token_ledger: members read" on token_ledger for select using (public.is_member());
-- No insert policy: tokens only move through the functions below.

create or replace function public.token_balance(t int) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from token_ledger where team_id = t
$$;

-- Buying tokens: a coach asks, pays the commish directly, and the commish approves.
create table if not exists token_requests (
  id bigint generated always as identity primary key,
  team_id int not null references teams(id) on delete cascade default public.my_team_id(),
  amount int not null check (amount between 1 and 100000),
  note text check (length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table token_requests enable row level security;
drop policy if exists "token_requests: members read" on token_requests;
create policy "token_requests: members read" on token_requests for select using (public.is_member());
drop policy if exists "token_requests: own club asks" on token_requests;
create policy "token_requests: own club asks" on token_requests for insert with check (team_id = public.my_team_id() and status = 'pending');

create or replace function public.decide_token_request(rid bigint, approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare r token_requests;
begin
  if not public.is_commish() then raise exception 'Only the commish can approve token purchases'; end if;
  select * into r from token_requests where id = rid for update;
  if r is null or r.status <> 'pending' then raise exception 'That request has already been handled'; end if;
  update token_requests set status = case when approve then 'approved' else 'declined' end, decided_at = now() where id = rid;
  if approve then insert into token_ledger (team_id, delta, reason) values (r.team_id, r.amount, 'Bought from the commish'); end if;
end $$;

create or replace function public.grant_tokens(t int, amount int, why text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Only the commish can grant tokens'; end if;
  insert into token_ledger (team_id, delta, reason) values (t, amount, coalesce(nullif(why, ''), 'Commish adjustment'));
end $$;

-- 3. Challenges: one club offers another a custom game, with an optional stake.
--    stake = { tokens: int, picks: int[] (pick ids), players: int[] (player ids), note: text } — the same stake from each side.
create table if not exists challenges (
  id bigint generated always as identity primary key,
  comp text not null,
  round int not null,
  from_team int not null references teams(id) on delete cascade default public.my_team_id(),
  to_team int not null references teams(id) on delete cascade,
  settings jsonb not null,
  stake jsonb not null default '{}'::jsonb,
  counter_stake jsonb,
  message text check (length(message) <= 200),
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'cancelled', 'settled')),
  game_id bigint references mini_games(id) on delete set null,
  winner_team int references teams(id),
  assets_done boolean not null default false,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  settled_at timestamptz,
  check (from_team <> to_team)
);
create index if not exists challenges_teams on challenges (from_team, to_team, status);
alter table challenges enable row level security;
drop policy if exists "challenges: members read" on challenges;
create policy "challenges: members read" on challenges for select using (public.is_member());
drop policy if exists "challenges: own club offers" on challenges;
create policy "challenges: own club offers" on challenges for insert with check (from_team = public.my_team_id() and status = 'offered');

-- Accept: both sides' tokens go into escrow and the game is linked.
create or replace function public.accept_challenge(cid bigint, gid bigint) returns void language plpgsql security definer set search_path = public as $$
declare c challenges; tok int;
begin
  select * into c from challenges where id = cid for update;
  if c is null or c.status <> 'offered' then raise exception 'That challenge is no longer open'; end if;
  if c.to_team <> public.my_team_id() and not public.is_commish() then raise exception 'Only the challenged club can accept'; end if;
  tok := coalesce((c.stake->>'tokens')::int, 0);
  if tok > 0 then
    if public.token_balance(c.from_team) < tok then raise exception 'The challenger no longer has % tokens', tok; end if;
    if public.token_balance(c.to_team) < tok then raise exception 'You need % tokens to accept', tok; end if;
    insert into token_ledger (team_id, delta, reason, challenge_id) values
      (c.from_team, -tok, 'Stake held for challenge #' || cid, cid), (c.to_team, -tok, 'Stake held for challenge #' || cid, cid);
  end if;
  update challenges set status = 'accepted', game_id = gid, responded_at = now() where id = cid;
end $$;

create or replace function public.close_challenge(cid bigint, how text) returns void language plpgsql security definer set search_path = public as $$
declare c challenges;
begin
  select * into c from challenges where id = cid for update;
  if c is null or c.status <> 'offered' then raise exception 'That challenge is no longer open'; end if;
  if how = 'declined' and c.to_team <> public.my_team_id() and not public.is_commish() then raise exception 'Only the challenged club can decline'; end if;
  if how = 'cancelled' and c.from_team <> public.my_team_id() and not public.is_commish() then raise exception 'Only the challenger can cancel'; end if;
  if how not in ('declined', 'cancelled') then raise exception 'Bad action'; end if;
  update challenges set status = how, responded_at = now() where id = cid;
end $$;

-- Settle: the winner takes both token stakes (a draw returns them). Picks and players are flagged for the commish.
create or replace function public.settle_challenge(cid bigint, winner int) returns void language plpgsql security definer set search_path = public as $$
declare c challenges; tok int;
begin
  select * into c from challenges where id = cid for update;
  if c is null or c.status <> 'accepted' then raise exception 'That challenge isn''t waiting on a result'; end if;
  if public.my_team_id() not in (c.from_team, c.to_team) and not public.is_commish() then raise exception 'Only the two clubs or the commish can settle'; end if;
  if winner is not null and winner not in (c.from_team, c.to_team) then raise exception 'The winner must be one of the two clubs'; end if;
  tok := coalesce((c.stake->>'tokens')::int, 0);
  if tok > 0 then
    if winner is null then
      insert into token_ledger (team_id, delta, reason, challenge_id) values
        (c.from_team, tok, 'Stake returned: challenge #' || cid || ' drawn', cid), (c.to_team, tok, 'Stake returned: challenge #' || cid || ' drawn', cid);
    else
      insert into token_ledger (team_id, delta, reason, challenge_id) values (winner, tok * 2, 'Won challenge #' || cid, cid);
    end if;
  end if;
  update challenges set status = 'settled', winner_team = winner, settled_at = now() where id = cid;
end $$;

create or replace function public.challenge_assets_done(cid bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commish() then raise exception 'Only the commish can mark picks and players as transferred'; end if;
  update challenges set assets_done = true where id = cid;
end $$;
