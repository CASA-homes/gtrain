-- 0085: Free and Pro plans for each league (agreed 25 Nov 2026).
--   Free: league setup, draft room, keepers, trades, matchday, ladder, basic player pages.
--   Pro ($10 a coach a season, paid by the commish): contracts and cap, the KT economy, Knockout Cup and mini comps,
--   draft centre tools, deep player profiles, league history.
--   Founding leagues: every league created before Round 1, 2027 plays the 2027 season on Pro, free.
-- The plan lives in its own table, not on leagues, because a commish can edit his league's row. Only a site admin
-- (site_admins) can change a plan; members can read their own league's.

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
-- No policies: nobody reads or writes it through the API. The functions below check it.

create table if not exists public.league_plans (
  league_id int primary key references public.leagues (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  founding boolean not null default false,
  pro_until timestamptz,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.league_plans enable row level security;
drop policy if exists "league_plans: members read" on public.league_plans;
create policy "league_plans: members read" on public.league_plans for select to authenticated
  using (exists (select 1 from public.members m where m.user_id = (select auth.uid()) and m.league_id = league_plans.league_id));

-- Round 1, 2027 starts 17 Mar 2027 (SYD v GEE, 7:30pm AEDT). Founding Pro runs to the end of 2027.
create or replace function public.founding_cutoff() returns timestamptz language sql immutable as $$ select '2027-03-17 08:30:00+00'::timestamptz $$;
create or replace function public.founding_pro_until() returns timestamptz language sql immutable as $$ select '2027-12-31 15:59:59+00'::timestamptz $$;

-- Every new league gets a plan row: founding Pro before Round 1, 2027, Free after.
create or replace function public.leagues_make_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into league_plans (league_id, plan, founding, pro_until, note)
  values (new.id,
          case when now() < founding_cutoff() then 'pro' else 'free' end,
          now() < founding_cutoff(),
          case when now() < founding_cutoff() then founding_pro_until() end,
          case when now() < founding_cutoff() then 'Founding league: Pro free for 2027' end)
  on conflict (league_id) do nothing;
  return new;
end $$;
drop trigger if exists leagues_make_plan on public.leagues;
create trigger leagues_make_plan after insert on public.leagues for each row execute function public.leagues_make_plan();

-- Existing leagues are all founding leagues.
insert into public.league_plans (league_id, plan, founding, pro_until, note)
select id, 'pro', true, public.founding_pro_until(), 'Founding league: Pro free for 2027' from public.leagues
on conflict (league_id) do nothing;

-- The current league's plan, as the app needs it. is_pro: Pro and not lapsed.
create or replace function public.league_plan()
returns table (plan text, founding boolean, pro_until timestamptz, is_pro boolean, coaches int)
language sql stable security definer set search_path = public as $$
  select coalesce(p.plan, 'free'), coalesce(p.founding, false), p.pro_until,
         coalesce(p.plan = 'pro' and (p.pro_until is null or p.pro_until > now()), false),
         (select count(*)::int from teams t where t.league_id = l.id)
    from leagues l left join league_plans p on p.league_id = l.id
   where l.id = public.current_league()
     and exists (select 1 from members m where m.user_id = auth.uid() and m.league_id = l.id)
$$;

create or replace function public.is_site_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from site_admins where user_id = auth.uid())
$$;

-- Site admin: every league with its plan.
create or replace function public.admin_league_plans()
returns table (league_id int, name text, created_at timestamptz, coaches int, plan text, founding boolean, pro_until timestamptz, is_pro boolean, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Site admins only'; end if;
  return query
  select l.id, l.name, l.created_at, (select count(*)::int from teams t where t.league_id = l.id),
         coalesce(p.plan, 'free'), coalesce(p.founding, false), p.pro_until,
         coalesce(p.plan = 'pro' and (p.pro_until is null or p.pro_until > now()), false), p.note
    from leagues l left join league_plans p on p.league_id = l.id
   order by l.id;
end $$;

-- Site admin: set a league's plan. Pro without a date runs until changed; Free clears the date.
create or replace function public.set_league_plan(p_league int, p_plan text, p_until timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Site admins only'; end if;
  if p_plan not in ('free', 'pro') then raise exception 'Plan is free or pro'; end if;
  insert into league_plans (league_id, plan, pro_until, note, updated_at)
  values (p_league, p_plan, case when p_plan = 'pro' then p_until end, p_note, now())
  on conflict (league_id) do update set plan = excluded.plan, pro_until = excluded.pro_until,
    note = coalesce(excluded.note, league_plans.note), updated_at = now();
end $$;

revoke all on function public.leagues_make_plan(), public.founding_cutoff(), public.founding_pro_until() from public, anon, authenticated;
revoke all on function public.league_plan(), public.is_site_admin(), public.admin_league_plans(), public.set_league_plan(int, text, timestamptz, text) from public, anon;
grant execute on function public.league_plan(), public.is_site_admin(), public.admin_league_plans(), public.set_league_plan(int, text, timestamptz, text) to authenticated;

-- Christian (site owner) is the first site admin.
insert into public.site_admins (user_id)
select id from auth.users where email = 'christianlopez91@outlook.com'
on conflict do nothing;
