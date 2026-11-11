-- League name: the commish names the league in League settings (e.g. "G-Train"); the site shows it as "G-Train League".
-- One row. Members read it; the commish edits it. league_name() lets the sign-in page show it before anyone is signed in.

create table if not exists public.league_profile (
  id          int primary key default 1 check (id = 1),
  name        text not null default 'G-Train' check (char_length(btrim(name)) between 1 and 40),
  updated_at  timestamptz not null default now()
);
alter table public.league_profile enable row level security;
drop policy if exists "league_profile: members read" on public.league_profile;
create policy "league_profile: members read" on public.league_profile for select using ((select public.is_member()));
drop policy if exists "league_profile: commish writes" on public.league_profile;
create policy "league_profile: commish writes" on public.league_profile for all using ((select public.is_commish())) with check ((select public.is_commish()));
insert into public.league_profile (id) values (1) on conflict (id) do nothing;

create or replace function public.league_name()
returns text language sql stable security definer set search_path = public as $$
  select name from league_profile where id = 1
$$;
grant execute on function public.league_name() to anon, authenticated;
