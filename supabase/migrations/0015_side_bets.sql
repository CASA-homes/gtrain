-- Side bets between coaches (single pint unless stated). The site only records them; settling is between the coaches.
create table if not exists public.side_bets (
  id          bigserial primary key,
  season      int  not null,
  title       text not null check (length(title) between 3 and 200),
  team_a      int  not null references public.teams(id),
  team_b      int  references public.teams(id),
  stake       text not null default 'A pint',
  status      text not null default 'open' check (status in ('open', 'settled', 'void')),
  winner_id   int  references public.teams(id),
  created_by  int  not null references public.teams(id) default public.my_team_id(),
  created_at  timestamptz not null default now()
);
create index if not exists side_bets_season on public.side_bets (season, created_at desc);
alter table public.side_bets enable row level security;

drop policy if exists "members read bets" on public.side_bets;
create policy "members read bets" on public.side_bets for select to authenticated using (public.is_member());

-- Coaches (not guests) log bets their own club is part of.
drop policy if exists "coaches log bets" on public.side_bets;
create policy "coaches log bets" on public.side_bets for insert to authenticated with check (
  created_by = public.my_team_id()
  and public.my_team_id() in (team_a, team_b)
  and not coalesce((select is_guest from public.teams where id = public.my_team_id()), false)
);

-- Either side of the bet, or the commish, settles or removes it.
drop policy if exists "parties settle bets" on public.side_bets;
create policy "parties settle bets" on public.side_bets for update to authenticated
  using (public.is_commish() or public.my_team_id() in (team_a, team_b))
  with check (public.is_commish() or public.my_team_id() in (team_a, team_b));
drop policy if exists "parties remove bets" on public.side_bets;
create policy "parties remove bets" on public.side_bets for delete to authenticated
  using (public.is_commish() or created_by = public.my_team_id());
