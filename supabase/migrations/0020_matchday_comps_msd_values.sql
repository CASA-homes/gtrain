-- Matchday, side comps + prizes, the mid-season draft, and the "Who'd you rather" player values.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Matchday: one lineup per club per game per round (G-Train weekly team, Rookie Shield, Survivor pick).
-- The Knockout Cup keeps its own cup_lineups table (0019).
-- ---------------------------------------------------------------------------
create table if not exists public.game_lineups (
  season     int  not null,
  comp       text not null check (comp ~ '^[a-z0-9_]{2,24}$'),
  round      int  not null check (round between 0 and 30),
  team_id    int  not null references public.teams(id) on delete cascade,
  lineup     jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (season, comp, round, team_id)
);
alter table public.game_lineups enable row level security;
drop policy if exists "game_lineups: members read" on public.game_lineups;
create policy "game_lineups: members read" on public.game_lineups for select using (public.is_member());
drop policy if exists "game_lineups: own club or commish writes" on public.game_lineups;
create policy "game_lineups: own club or commish writes" on public.game_lineups for insert with check (team_id = public.my_team_id() or public.is_commish());
drop policy if exists "game_lineups: own club or commish updates" on public.game_lineups;
create policy "game_lineups: own club or commish updates" on public.game_lineups for update
  using (team_id = public.my_team_id() or public.is_commish()) with check (team_id = public.my_team_id() or public.is_commish());

-- ---------------------------------------------------------------------------
-- Side comps: the commish sets the menu and how many each coach may enter; coaches opt in.
-- ---------------------------------------------------------------------------
create table if not exists public.comp_settings (
  season   int primary key,
  cap      int not null default 2 check (cap between 0 and 10),
  enabled  text[] not null default '{plate,shield,survivor,ruck,captain}',
  locks_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.comp_settings enable row level security;
drop policy if exists "comp_settings: members read" on public.comp_settings;
create policy "comp_settings: members read" on public.comp_settings for select using (public.is_member());
drop policy if exists "comp_settings: commish writes" on public.comp_settings;
create policy "comp_settings: commish writes" on public.comp_settings for all using (public.is_commish()) with check (public.is_commish());

create table if not exists public.comp_entries (
  season    int  not null,
  comp      text not null,
  team_id   int  not null references public.teams(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (season, comp, team_id)
);
alter table public.comp_entries enable row level security;
drop policy if exists "comp_entries: members read" on public.comp_entries;
create policy "comp_entries: members read" on public.comp_entries for select using (public.is_member());
drop policy if exists "comp_entries: own club or commish joins" on public.comp_entries;
create policy "comp_entries: own club or commish joins" on public.comp_entries for insert with check (team_id = public.my_team_id() or public.is_commish());
drop policy if exists "comp_entries: own club or commish leaves" on public.comp_entries;
create policy "comp_entries: own club or commish leaves" on public.comp_entries for delete using (team_id = public.my_team_id() or public.is_commish());

-- Prizes. Minted: created by the commish (a bonus pick, a move up the MSD order, tokens, a trophy).
-- Staked: put up by an entrant from their own list (a pick, a player or tokens). Winner takes it once the commish settles.
create table if not exists public.comp_prizes (
  id          bigserial primary key,
  season      int  not null,
  comp        text not null,
  source      text not null check (source in ('minted', 'staked')),
  kind        text not null check (kind in ('pick', 'player', 'tokens', 'msd_bump', 'bonus_pick', 'trophy', 'other')),
  pick_id     int  references public.picks(id) on delete set null,
  player_id   int  references public.players(id) on delete set null,
  amount      int,
  label       text not null check (length(label) between 1 and 120),
  place       int  not null default 1 check (place between 1 and 10),
  staked_by   int  references public.teams(id) on delete set null,
  winner_id   int  references public.teams(id) on delete set null,
  status      text not null default 'pool' check (status in ('pool', 'awarded', 'transferred', 'returned', 'void')),
  created_by  int  references public.teams(id) default public.my_team_id(),
  created_at  timestamptz not null default now(),
  settled_at  timestamptz
);
create index if not exists comp_prizes_season on public.comp_prizes (season, comp, id);
alter table public.comp_prizes enable row level security;
drop policy if exists "comp_prizes: members read" on public.comp_prizes;
create policy "comp_prizes: members read" on public.comp_prizes for select using (public.is_member());
drop policy if exists "comp_prizes: commish mints, coaches stake their own" on public.comp_prizes;
create policy "comp_prizes: commish mints, coaches stake their own" on public.comp_prizes for insert with check (
  public.is_commish() or (source = 'staked' and staked_by = public.my_team_id()));
drop policy if exists "comp_prizes: commish settles" on public.comp_prizes;
create policy "comp_prizes: commish settles" on public.comp_prizes for update using (public.is_commish()) with check (public.is_commish());
drop policy if exists "comp_prizes: commish or staker removes while in the pool" on public.comp_prizes;
create policy "comp_prizes: commish or staker removes while in the pool" on public.comp_prizes for delete using (
  public.is_commish() or (status = 'pool' and staked_by = public.my_team_id()));

-- ---------------------------------------------------------------------------
-- Mid-season draft. MSD picks live in the picks table (kind = 'msd') so they trade like any other pick.
-- Each club drops 3 and picks 3; order is straight reverse ladder after round 10 (every round the same order).
-- ---------------------------------------------------------------------------
alter table public.picks add column if not exists kind text not null default 'draft';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'picks_kind_check') then
    alter table public.picks add constraint picks_kind_check check (kind in ('draft', 'msd', 'bonus'));
  end if;
end $$;

create table if not exists public.msd_state (
  season        int primary key,
  phase         text not null default 'setup' check (phase in ('setup', 'drops', 'drafting', 'done')),
  freeze_round  int  not null default 10,
  order_team_ids int[] not null default '{}',      -- pick 1 first (last on the ladder)
  drops_due     timestamptz,
  clock_seconds int not null default 0,             -- 0 = no shot clock
  on_clock_since timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.msd_state enable row level security;
drop policy if exists "msd_state: members read" on public.msd_state;
create policy "msd_state: members read" on public.msd_state for select using (public.is_member());
drop policy if exists "msd_state: commish writes" on public.msd_state;
create policy "msd_state: commish writes" on public.msd_state for all using (public.is_commish()) with check (public.is_commish());

create table if not exists public.msd_drops (
  season    int not null,
  team_id   int not null references public.teams(id) on delete cascade,
  player_id int not null references public.players(id) on delete cascade,
  dropped_at timestamptz not null default now(),
  primary key (season, player_id)
);
alter table public.msd_drops enable row level security;
drop policy if exists "msd_drops: members read" on public.msd_drops;
create policy "msd_drops: members read" on public.msd_drops for select using (public.is_member());
drop policy if exists "msd_drops: own club or commish" on public.msd_drops;
create policy "msd_drops: own club or commish" on public.msd_drops for insert with check (team_id = public.my_team_id() or public.is_commish());
drop policy if exists "msd_drops: own club or commish removes" on public.msd_drops;
create policy "msd_drops: own club or commish removes" on public.msd_drops for delete using (team_id = public.my_team_id() or public.is_commish());

create table if not exists public.msd_selections (
  season    int not null,
  pick_id   int not null references public.picks(id) on delete cascade,
  team_id   int not null references public.teams(id) on delete cascade,
  player_id int not null,             -- a players.id, or a free agent's id from the keeper board (added to players when applied)
  player_name text not null default '',
  made_at   timestamptz not null default now(),
  applied   boolean not null default false,
  primary key (season, pick_id),
  unique (season, player_id)
);
alter table public.msd_selections enable row level security;
drop policy if exists "msd_selections: members read" on public.msd_selections;
create policy "msd_selections: members read" on public.msd_selections for select using (public.is_member());
drop policy if exists "msd_selections: club on the clock or commish" on public.msd_selections;
create policy "msd_selections: club on the clock or commish" on public.msd_selections for insert with check (team_id = public.my_team_id() or public.is_commish());
drop policy if exists "msd_selections: commish undoes" on public.msd_selections;
create policy "msd_selections: commish undoes" on public.msd_selections for delete using (public.is_commish());

-- Applying the draft adds free agents to players and moves squads: the commish needs write access to players.
drop policy if exists "commish manages players" on public.players;
create policy "commish manages players" on public.players for all to authenticated using (public.is_commish()) with check (public.is_commish());

-- ---------------------------------------------------------------------------
-- "Who'd you rather": one row per swipe. Values are worked out from these on read.
-- ---------------------------------------------------------------------------
create table if not exists public.value_votes (
  id         bigserial primary key,
  voter_id   int  not null references public.teams(id) on delete cascade default public.my_team_id(),
  mode       text not null default 'dynasty' check (mode in ('dynasty', 'now')),
  a_id       int  not null,          -- player id, or -pick id for a pick
  b_id       int  not null,
  winner     int,                    -- a_id, b_id, or null for "too close"
  created_at timestamptz not null default now(),
  check (a_id <> b_id)
);
create index if not exists value_votes_mode on public.value_votes (mode, id);
alter table public.value_votes enable row level security;
drop policy if exists "value_votes: members read" on public.value_votes;
create policy "value_votes: members read" on public.value_votes for select using (public.is_member());
drop policy if exists "value_votes: members vote as themselves" on public.value_votes;
create policy "value_votes: members vote as themselves" on public.value_votes for insert with check (voter_id = public.my_team_id());
