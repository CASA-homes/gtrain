-- Raw match stats from AFL Tables and Footywire, with fantasy points worked out from them. A second (and third) source
-- alongside the existing feed: checked against the stored scores, and ready to take over completed rounds.

create table if not exists public.stat_lines (
  source text not null check (source in ('afltables', 'footywire')),
  season int not null,
  round int not null,
  club text not null,
  name text not null,
  player_id int references public.players(id) on delete set null,
  k int not null default 0, hb int not null default 0, m int not null default 0, g int not null default 0, b int not null default 0,
  ho int not null default 0, t int not null default 0, ff int not null default 0, fa int not null default 0,
  tog int, points int not null, official int,
  fetched_at timestamptz not null default now(),
  primary key (source, season, round, club, name)
);
create index if not exists stat_lines_player on public.stat_lines (player_id, season, round);
alter table public.stat_lines enable row level security;
drop policy if exists stat_lines_read on public.stat_lines;
create policy stat_lines_read on public.stat_lines for select to authenticated using (public.is_member());

create or replace function public.stat_norm(s text) returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(s, '')), '[^a-z]', '', 'g')
$$;

-- Commish: store a batch of lines and link each to a player by full name (club breaks ties).
create or replace function public.stats_upsert(rows jsonb) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_commish() then raise exception 'Only the commish can sync stats'; end if;
  insert into stat_lines (source, season, round, club, name, k, hb, m, g, b, ho, t, ff, fa, tog, points, official, fetched_at)
  select x.source, x.season, x.round, x.club, x.name, x.k, x.hb, x.m, x.g, x.b, x.ho, x.t, x.ff, x.fa, x.tog, x.points, x.official, now()
    from jsonb_to_recordset(rows) as x(source text, season int, round int, club text, name text, k int, hb int, m int, g int, b int, ho int, t int, ff int, fa int, tog int, points int, official int)
  on conflict (source, season, round, club, name) do update set
    k = excluded.k, hb = excluded.hb, m = excluded.m, g = excluded.g, b = excluded.b, ho = excluded.ho, t = excluded.t,
    ff = excluded.ff, fa = excluded.fa, tog = excluded.tog, points = excluded.points, official = excluded.official, fetched_at = now();
  get diagnostics n = row_count;
  update stat_lines s set player_id = (
      select p.id from players p where public.stat_norm(p.full_name) = public.stat_norm(s.name)
       order by (p.afl_club = s.club) desc, p.id limit 1)
   where s.player_id is null;
  return n;
end $$;

-- Commish: how each source lines up with the stored scores for a season.
create or replace function public.stats_compare(p_season int) returns json language sql stable security definer set search_path = public as $$
  with stored as (
    select ps.player_id, (e->>0)::int round, (e->>1)::int score
      from player_seasons ps, jsonb_array_elements(ps.games_log) e where ps.season = p_season
  ), j as (
    select s.source, s.player_id, s.name, s.round, s.points, s.official, st.score
      from stat_lines s left join stored st on st.player_id = s.player_id and st.round = s.round
     where s.season = p_season
  )
  select case when public.is_commish() then json_agg(x) end from (
    select source,
           count(*) lines,
           count(*) filter (where player_id is not null) linked,
           count(score) compared,
           count(*) filter (where score is not null and points = score) exact,
           count(*) filter (where official is not null and points = official) matches_official,
           (select json_agg(m) from (select j2.name, j2.round, j2.points, j2.score from j j2 where j2.source = j.source and j2.score is not null and j2.points <> j2.score order by abs(j2.points - j2.score) desc limit 15) m) worst
      from j group by source
  ) x
$$;

grant execute on function public.stats_upsert(jsonb), public.stats_compare(int) to authenticated;
