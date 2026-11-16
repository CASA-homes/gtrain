-- Join a league with an invite code: a new coach signs up, picks an open club, and the commish approves.

alter table public.leagues add column if not exists join_code text;
create unique index if not exists leagues_join_code on public.leagues (upper(join_code));

create or replace function public.gen_join_code(p_slug text) returns text language sql volatile as $$
  select upper(left(regexp_replace(coalesce(p_slug, 'LEAGUE'), '[^a-zA-Z0-9]', '', 'g'), 8)) || '-' ||
         array_to_string(array(select substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1) from generate_series(1, 4)), '')
$$;
update public.leagues set join_code = public.gen_join_code(slug) where join_code is null;

create table if not exists public.join_requests (
  id bigserial primary key,
  league_id int not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  team_id int references public.teams(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (league_id, user_id)
);
alter table public.join_requests enable row level security;
drop policy if exists join_requests_own on public.join_requests;
create policy join_requests_own on public.join_requests for select to authenticated using (user_id = auth.uid());

-- Anyone with the code: the league's name and its clubs (open ones have no coach yet).
create or replace function public.join_lookup(p_code text) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'league_id', l.id, 'name', l.name,
    'clubs', coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'short_code', t.short_code, 'coach', t.coach_name,
                          'open', not exists (select 1 from members m where m.team_id = t.id and m.league_id = l.id)) order by t.name)
                         from teams t where t.league_id = l.id and not coalesce(t.is_guest, false)), '[]'::json))
    from leagues l where upper(l.join_code) = upper(trim(p_code))
$$;
grant execute on function public.join_lookup(text) to anon, authenticated;

-- Signed-in user asks to join as a club.
create or replace function public.join_request(p_code text, p_team int) returns text language plpgsql security definer set search_path = public as $$
declare l leagues; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into l from leagues where upper(join_code) = upper(trim(p_code));
  if l.id is null then raise exception 'That league code isn''t right. Check it with your commish'; end if;
  if exists (select 1 from members where user_id = auth.uid() and league_id = l.id) then return 'member'; end if;
  if not exists (select 1 from teams where id = p_team and league_id = l.id and not coalesce(is_guest, false)) then raise exception 'Pick one of the league''s clubs'; end if;
  if exists (select 1 from members where team_id = p_team and league_id = l.id) then raise exception 'That club already has a coach. Pick another, or ask your commish'; end if;
  select email into em from auth.users where id = auth.uid();
  insert into join_requests (league_id, user_id, email, team_id, status) values (l.id, auth.uid(), lower(em), p_team, 'pending')
    on conflict (league_id, user_id) do update set team_id = excluded.team_id, status = case when join_requests.status = 'approved' then 'approved' else 'pending' end, created_at = now(), decided_at = null;
  return 'pending';
end $$;
grant execute on function public.join_request(text, int) to authenticated;

-- The signed-in user's join requests (for the "waiting for approval" screen).
create or replace function public.my_join_status() returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('league', l.name, 'club', t.name, 'status', r.status, 'code', l.join_code) order by r.created_at desc), '[]'::json)
    from join_requests r join leagues l on l.id = r.league_id left join teams t on t.id = r.team_id
   where r.user_id = auth.uid()
$$;
grant execute on function public.my_join_status() to authenticated;

-- Commish: the code and the requests waiting for this league.
create or replace function public.join_admin() returns json language sql stable security definer set search_path = public as $$
  select case when public.is_commish() then json_build_object(
    'code', (select join_code from leagues where id = public.current_league()),
    'requests', coalesce((select json_agg(json_build_object('id', r.id, 'email', r.email, 'team_id', r.team_id, 'club', t.name, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
                          from join_requests r left join teams t on t.id = r.team_id where r.league_id = public.current_league() and r.status = 'pending'), '[]'::json),
    'open', coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name) order by t.name) from teams t
                      where t.league_id = public.current_league() and not coalesce(t.is_guest, false)
                        and not exists (select 1 from members m where m.team_id = t.id and m.league_id = t.league_id)), '[]'::json)
  ) end
$$;
grant execute on function public.join_admin() to authenticated;

create or replace function public.join_decide(p_id bigint, p_approve boolean, p_team int default null) returns text language plpgsql security definer set search_path = public as $$
declare r join_requests; tm int;
begin
  select * into r from join_requests where id = p_id for update;
  if r.id is null then raise exception 'No such request'; end if;
  if not exists (select 1 from members where user_id = auth.uid() and league_id = r.league_id and is_commish) then raise exception 'Only the commish can do that'; end if;
  if r.status <> 'pending' then raise exception 'Already decided'; end if;
  if not p_approve then
    update join_requests set status = 'declined', decided_at = now() where id = p_id;
    return 'declined';
  end if;
  tm := coalesce(p_team, r.team_id);
  if not exists (select 1 from teams where id = tm and league_id = r.league_id) then raise exception 'Pick a club for them'; end if;
  if exists (select 1 from members where team_id = tm and league_id = r.league_id) then raise exception 'That club already has a coach'; end if;
  insert into members (user_id, league_id, team_id, email, is_commish) values (r.user_id, r.league_id, tm, r.email, false)
    on conflict (user_id, league_id) do update set team_id = excluded.team_id;
  update join_requests set status = 'approved', team_id = tm, decided_at = now() where id = p_id;
  return 'approved';
end $$;
grant execute on function public.join_decide(bigint, boolean, int) to authenticated;

create or replace function public.join_reset_code() returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_commish() then raise exception 'Only the commish can do that'; end if;
  update leagues set join_code = public.gen_join_code(slug) where id = public.current_league() returning join_code into c;
  return c;
end $$;
grant execute on function public.join_reset_code() to authenticated;

-- Coaches who joined by code (and anyone with a request in) can sign in too.
create or replace function public.email_is_allowed(check_email text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_emails where email = lower(trim(check_email)))
      or exists (select 1 from public.members where lower(email) = lower(trim(check_email)))
      or exists (select 1 from public.join_requests where email = lower(trim(check_email)))
$$;
