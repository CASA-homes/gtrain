-- G-Train Fantasy Keeper: initial schema
-- Run once in the Supabase SQL editor (or `supabase db push`), then run seed.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- League structure
-- ---------------------------------------------------------------------------
create table public.teams (
  id            serial primary key,
  keeper_id     int unique,                 -- team id on keeperfantasy.com
  name          text not null unique,
  coach_name    text not null,
  short_code    text not null,              -- e.g. BB, used in avatars
  joined_season int not null default 2022,
  created_at    timestamptz not null default now()
);

-- Who is allowed to sign in. Only emails listed here can create an account.
create table public.allowed_emails (
  email      text primary key check (email = lower(email)),
  team_id    int not null references public.teams(id) on delete cascade,
  is_commish boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per signed-in coach, created automatically on first login.
create table public.members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  team_id      int not null references public.teams(id),
  is_commish   boolean not null default false,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.seasons (
  year           int primary key,
  premier_id     int references public.teams(id),
  runner_up_id   int references public.teams(id),
  spoon_id       int references public.teams(id),
  medal          text,
  gf_winner_score int,
  gf_loser_score  int
);

create table public.ladder (
  season   int not null references public.seasons(year) on delete cascade,
  team_id  int not null references public.teams(id),
  rank     int not null,
  wins     int not null,
  losses   int not null,
  draws    int not null default 0,
  points   int not null,
  pts_for  int not null,
  pts_against int not null,
  primary key (season, team_id)
);

-- ---------------------------------------------------------------------------
-- Players and squads
-- ---------------------------------------------------------------------------
create table public.players (
  id          serial primary key,
  name        text not null,                -- as shown on Keeper, e.g. "B. Smith"
  full_name   text,                         -- filled by the stats feed
  afl_club    text,                         -- 3-letter code, filled by the stats feed
  positions   text[] not null default '{}', -- {MID,FWD}
  birth_date  date,
  draft_year  int,
  draft_pick  int,                          -- AFL national draft pick, for potential
  photo_path  text,                         -- storage path of an uploaded photo
  unique (name, positions)
);

create table public.player_seasons (
  player_id int not null references public.players(id) on delete cascade,
  season    int not null,
  games     int,
  average   numeric(5,1),
  last5     int[],                          -- most recent first, null = did not play
  tons      int,                            -- 100+ scores
  status    text,                           -- SEASON, SHORT, LONG, OUT, SUSP, DEL
  primary key (player_id, season)
);

-- Current ownership. A player is on at most one list.
create table public.squad (
  player_id       int primary key references public.players(id) on delete cascade,
  team_id         int not null references public.teams(id),
  is_keeper       boolean not null default false,
  is_rookie_keeper boolean not null default false,
  acquired_how    text,                     -- "2024 draft R1 P3", "trade with Zac A"
  acquired_season int,
  updated_at      timestamptz not null default now()
);

-- Ownership history, for "longest held" and player timelines.
create table public.ownership (
  id         serial primary key,
  player_id  int not null references public.players(id) on delete cascade,
  team_id    int not null references public.teams(id),
  from_season int not null,
  to_season   int,                          -- null = still owned
  how        text
);

create table public.picks (
  id               serial primary key,
  year             int not null,
  round            int not null,
  overall          int,
  original_team_id int not null references public.teams(id),
  owner_team_id    int not null references public.teams(id),
  is_optional      boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Market
-- ---------------------------------------------------------------------------
create type public.listing_kind as enum ('trade', 'sale', 'auction');
create type public.listing_status as enum ('open', 'pending', 'done', 'withdrawn', 'expired');

create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  player_id   int not null references public.players(id),
  team_id     int not null references public.teams(id),
  kind        public.listing_kind not null default 'trade',
  asking      text,                         -- "2027 R2"
  minimum     text,                         -- "2027 R3"
  open_to     text,                         -- "Ruck swap"
  reserve_pts int,                          -- auctions: reserve in pick points
  ends_at     timestamptz,                  -- auctions only
  status      public.listing_status not null default 'open',
  created_by  uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.offers (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  team_id     int not null references public.teams(id),
  offer       text not null,                -- "2027 R2 (pick 14)"
  points      int,                          -- pick-point value of the offer
  message     text,
  status      text not null default 'open' check (status in ('open','countered','accepted','declined','withdrawn')),
  created_by  uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.listing_comments (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  team_id     int not null references public.teams(id),
  body        text not null check (char_length(body) between 1 and 1000),
  created_by  uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.wishes (
  id          uuid primary key default gen_random_uuid(),
  team_id     int not null references public.teams(id),
  tag         text not null default 'Player' check (tag in ('Player','Pick','Rebuild')),
  want        text not null,
  offering    text,
  status      text not null default 'open' check (status in ('open','closed')),
  created_by  uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.wish_replies (
  id         uuid primary key default gen_random_uuid(),
  wish_id    uuid not null references public.wishes(id) on delete cascade,
  team_id    int not null references public.teams(id),
  body       text not null check (char_length(body) between 1 and 1000),
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- A completed or proposed trade. Needs commissioner approval (league charter).
create table public.trades (
  id           uuid primary key default gen_random_uuid(),
  team_a       int not null references public.teams(id),
  team_b       int not null references public.teams(id),
  a_gives      text not null,
  b_gives      text not null,
  a_points     int,
  b_points     int,
  listing_id   uuid references public.listings(id),
  status       text not null default 'proposed' check (status in ('proposed','approved','vetoed','cancelled')),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Lopsided-trade votes: 6 of 10 vetoes a trade (league charter).
create table public.trade_votes (
  trade_id uuid not null references public.trades(id) on delete cascade,
  team_id  int not null references public.teams(id),
  veto     boolean not null,
  primary key (trade_id, team_id)
);

-- ---------------------------------------------------------------------------
-- League hub
-- ---------------------------------------------------------------------------
create table public.news (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'News' check (kind in ('Draft day','Deadline','Catch-up','Market','News')),
  title      text not null,
  details    text,
  happens_at timestamptz,
  location   text,
  pinned     boolean not null default false,
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.rsvps (
  news_id  uuid not null references public.news(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade default auth.uid(),
  answer   text not null check (answer in ('yes','maybe','no')),
  primary key (news_id, user_id)
);

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  team_id    int not null references public.teams(id),
  body       text not null check (char_length(body) between 1 and 2000),
  pinned     boolean not null default false,
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  reaction   text not null check (reaction in ('haha','fire','clap','in')),
  primary key (message_id, user_id, reaction)
);

create table public.fines (
  id         uuid primary key default gen_random_uuid(),
  team_id    int not null references public.teams(id),
  amount     int not null,
  reason     text not null,
  season     int not null,
  paid       boolean not null default false,
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index on public.squad (team_id);
create index on public.offers (listing_id);
create index on public.listing_comments (listing_id);
create index on public.chat_messages (created_at desc);
create index on public.player_seasons (season);

-- ---------------------------------------------------------------------------
-- Helper functions used by row-level security
-- ---------------------------------------------------------------------------
create or replace function public.my_team_id() returns int
language sql stable security definer set search_path = public as $$
  select team_id from public.members where user_id = auth.uid()
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid())
$$;

create or replace function public.is_commish() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_commish from public.members where user_id = auth.uid()), false)
$$;

-- Lets the login page say "that email isn't on the list" before sending a link.
create or replace function public.email_is_allowed(check_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_emails where email = lower(trim(check_email)))
$$;
grant execute on function public.email_is_allowed(text) to anon, authenticated;

-- Invite-only: block sign-ups from emails not on the list, and create the member row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  invite public.allowed_emails%rowtype;
begin
  select * into invite from public.allowed_emails where email = lower(new.email);
  if not found then
    raise exception 'This email is not on the G-Train invite list';
  end if;
  insert into public.members (user_id, email, team_id, is_commish)
  values (new.id, lower(new.email), invite.team_id, invite.is_commish);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeper limits from the charter: 17 keepers plus 1 rookie keeper (10 games or fewer).
create or replace function public.check_keeper_limits() returns trigger
language plpgsql as $$
declare
  n_keepers int;
  n_rookies int;
begin
  select count(*) filter (where is_keeper and not is_rookie_keeper),
         count(*) filter (where is_rookie_keeper)
    into n_keepers, n_rookies
    from public.squad where team_id = new.team_id;
  if n_keepers > 17 then raise exception 'Keeper limit is 17 (plus one rookie)'; end if;
  if n_rookies > 1 then raise exception 'Only one rookie keeper allowed'; end if;
  return new;
end;
$$;

create constraint trigger squad_keeper_limits
  after insert or update on public.squad
  deferrable initially deferred
  for each row execute function public.check_keeper_limits();

-- ---------------------------------------------------------------------------
-- Row-level security: members read everything; writes are scoped to your team.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['teams','seasons','ladder','players','player_seasons','squad','ownership','picks',
                           'listings','offers','listing_comments','wishes','wish_replies','trades','trade_votes',
                           'news','rsvps','chat_messages','chat_reactions','fines','members']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member())', t);
  end loop;
end $$;

alter table public.allowed_emails enable row level security;
create policy "commish reads invites" on public.allowed_emails for select to authenticated using (public.is_commish());
create policy "commish manages invites" on public.allowed_emails for all to authenticated using (public.is_commish()) with check (public.is_commish());

-- Squad: coaches set their own keepers; the commish can fix anything.
create policy "own team keepers" on public.squad for update to authenticated
  using (team_id = public.my_team_id() or public.is_commish())
  with check (team_id = public.my_team_id() or public.is_commish());
create policy "commish manages squads" on public.squad for all to authenticated
  using (public.is_commish()) with check (public.is_commish());

-- Market
create policy "list own players" on public.listings for insert to authenticated
  with check (team_id = public.my_team_id()
              and exists (select 1 from public.squad s where s.player_id = listings.player_id and s.team_id = public.my_team_id()));
create policy "edit own listings" on public.listings for update to authenticated
  using (team_id = public.my_team_id() or public.is_commish());
create policy "offer as own team" on public.offers for insert to authenticated
  with check (team_id = public.my_team_id());
create policy "seller or bidder updates offer" on public.offers for update to authenticated
  using (team_id = public.my_team_id()
         or exists (select 1 from public.listings l where l.id = offers.listing_id and l.team_id = public.my_team_id()));
create policy "comment as own team" on public.listing_comments for insert to authenticated
  with check (team_id = public.my_team_id());
create policy "wish as own team" on public.wishes for insert to authenticated with check (team_id = public.my_team_id());
create policy "edit own wish" on public.wishes for update to authenticated using (team_id = public.my_team_id());
create policy "reply as own team" on public.wish_replies for insert to authenticated with check (team_id = public.my_team_id());

-- Trades: either side proposes; only the commish approves or vetoes; any team votes once.
create policy "propose own trades" on public.trades for insert to authenticated
  with check (public.my_team_id() in (team_a, team_b));
create policy "commish decides trades" on public.trades for update to authenticated using (public.is_commish());
create policy "vote as own team" on public.trade_votes for insert to authenticated with check (team_id = public.my_team_id());

-- League hub
create policy "commish posts news" on public.news for all to authenticated using (public.is_commish()) with check (public.is_commish());
create policy "rsvp as self" on public.rsvps for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "chat as own team" on public.chat_messages for insert to authenticated
  with check (team_id = public.my_team_id() and created_by = auth.uid());
create policy "commish pins chat" on public.chat_messages for update to authenticated using (public.is_commish());
create policy "delete own chat" on public.chat_messages for delete to authenticated using (created_by = auth.uid() or public.is_commish());
create policy "react as self" on public.chat_reactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "commish manages fines" on public.fines for all to authenticated using (public.is_commish()) with check (public.is_commish());
create policy "update own name" on public.members for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and team_id = public.my_team_id());

-- Live updates for chat, offers and auctions
alter publication supabase_realtime add table public.chat_messages, public.chat_reactions, public.offers, public.listing_comments, public.listings;

-- Player photos (public read so <img> tags work; only members upload)
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict do nothing;
create policy "members upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member());
