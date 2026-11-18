-- A league's own past drafts, uploaded by the commish from a spreadsheet and shown in League history.
create table public.league_drafts (
  id serial primary key,
  league_id int not null default public.current_league() references public.leagues(id) on delete cascade,
  year int not null check (year between 1990 and 2100),
  label text,
  teams text[] not null default '{}',
  picks jsonb not null default '[]',
  source text,
  created_at timestamptz not null default now(),
  unique (league_id, year)
);
alter table public.league_drafts enable row level security;
create policy "league scope" on public.league_drafts as restrictive using (league_id = (select public.current_league())) with check (league_id = (select public.current_league()));
create policy "members read" on public.league_drafts for select to authenticated using ((select public.is_member()));
create policy "commish manages drafts" on public.league_drafts to authenticated using ((select public.is_commish())) with check ((select public.is_commish()));
create policy "definer access" on public.league_drafts to khq_definer using (true) with check (true);
grant select, insert, update, delete on public.league_drafts to authenticated;
grant usage on sequence public.league_drafts_id_seq to authenticated;
