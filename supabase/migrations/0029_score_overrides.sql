-- Commish score override: fix or fill in a player's score when the live feed is wrong or down.
--  * score_overrides: one row per player the commish has set for a round. Wins over the feed everywhere.
--  * score_rounds:    per round, whether the feed is paused (manual scores only) and, once locked, a frozen snapshot of
--                     every score so a late stats correction can't flip a result.
--  * score_log:       every change, visible to all coaches.
-- League-scoped like every other league table (see 0027/0028). Members read; only the commish writes.

create table if not exists public.score_overrides (
  league_id   int not null default public.current_league() references public.leagues(id) on delete cascade,
  comp        text not null check (length(comp) between 3 and 20),
  round       int not null check (round between 0 and 40),
  player_id   int not null,
  player_name text not null default '' check (length(player_name) <= 60),
  score       int not null check (score between -50 and 400),
  feed_score  int,
  reason      text check (length(reason) <= 120),
  set_by      uuid default auth.uid(),
  set_at      timestamptz not null default now(),
  primary key (league_id, comp, round, player_id)
);

create table if not exists public.score_rounds (
  league_id  int not null default public.current_league() references public.leagues(id) on delete cascade,
  comp       text not null check (length(comp) between 3 and 20),
  round      int not null check (round between 0 and 40),
  paused     boolean not null default false,
  locked_at  timestamptz,
  locked_by  uuid,
  snapshot   jsonb,            -- { "<player_id>": score } frozen when the round was locked
  updated_at timestamptz not null default now(),
  primary key (league_id, comp, round)
);

create table if not exists public.score_log (
  id        bigint generated always as identity primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  comp      text not null check (length(comp) between 3 and 20),
  round     int not null,
  what      text not null check (length(what) <= 200),
  who       text not null default '' check (length(who) <= 60),
  at        timestamptz not null default now()
);
create index if not exists score_log_round_idx on public.score_log (league_id, comp, round, at desc);

do $$
declare t text;
begin
  foreach t in array array['score_overrides', 'score_rounds', 'score_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "league scope" on public.%I', t);
    execute format('create policy "league scope" on public.%I as restrictive for all using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()))', t);
    execute format('drop policy if exists "definer access" on public.%I', t);
    execute format('create policy "definer access" on public.%I for all to khq_definer using (true) with check (true)', t);
    execute format('drop policy if exists "%s: members read" on public.%I', t, t);
    execute format('create policy "%s: members read" on public.%I for select using ((select public.is_member()))', t, t);
    execute format('drop policy if exists "%s: commish writes" on public.%I', t, t);
    execute format('create policy "%s: commish writes" on public.%I for all using ((select public.is_commish())) with check ((select public.is_commish()))', t, t);
  end loop;
end $$;
