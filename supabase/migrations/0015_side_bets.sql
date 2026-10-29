-- Side bets (charter section 5): single pint unless stated. The site records and settles them; paying up is between the coaches.
-- Sides are coach nicknames as the league uses them (Over/Under, Yes/No, or one coach v another).
drop table if exists public.side_bets;
create table public.side_bets (
  id            bigserial primary key,
  season        int  not null,
  category      text not null default 'Other',
  subject       text not null check (length(subject) between 2 and 160),
  line          numeric,
  kind          text not null default 'over_under' check (kind in ('over_under', 'yes_no', 'versus')),
  side_a_label  text not null default 'Over',
  side_b_label  text not null default 'Under',
  side_a        text[] not null default '{}',
  side_b        text[] not null default '{}',
  stake         text not null default 'A pint',
  result        text check (result in ('a', 'b', 'push', 'void')),
  actual        text,
  note          text,
  created_by    int  not null references public.teams(id) default public.my_team_id(),
  created_at    timestamptz not null default now()
);
create index side_bets_season on public.side_bets (season, category, id);
alter table public.side_bets enable row level security;
create policy "members read bets" on public.side_bets for select to authenticated using (public.is_member());
create policy "coaches log bets" on public.side_bets for insert to authenticated with check (
  created_by = public.my_team_id()
  and not coalesce((select is_guest from public.teams where id = public.my_team_id()), false)
);
create policy "commish or logger settles" on public.side_bets for update to authenticated
  using (public.is_commish() or created_by = public.my_team_id())
  with check (public.is_commish() or created_by = public.my_team_id());
create policy "commish or logger removes" on public.side_bets for delete to authenticated
  using (public.is_commish() or created_by = public.my_team_id());
