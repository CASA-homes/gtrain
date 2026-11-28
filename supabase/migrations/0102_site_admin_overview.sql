-- Site admin control room: one call that returns the whole site at a glance for /admin. Site admins only.
--   metrics   users, sign-ups and sign-ins
--   leagues   every league with plan, clubs claimed, pending joins, setup stage, last activity and flags
--   users     every account with the leagues and clubs it belongs to
--   activity  the latest sign-ups, leagues, clubs claimed, join requests, trades and share trades
--   health    stats sync per source, score corrections, pending join requests
-- Owned by postgres (like admin_league_plans) because it reads auth.users.

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare out jsonb;
begin
  if not public.is_site_admin() then raise exception 'Site admins only'; end if;

  with lg as (
    select l.id, l.name, l.created_at, l.season, l.setup_mode, l.squads_locked_at, l.settings,
           coalesce(p.plan, 'free') plan, coalesce(p.founding, false) founding, p.pro_until,
           coalesce(p.plan = 'pro' and (p.pro_until is null or p.pro_until > now()), false) is_pro,
           (select count(*) from teams t where t.league_id = l.id and not coalesce(t.is_guest, false)) clubs,
           (select count(distinct m.team_id) from members m join teams t on t.id = m.team_id
              where m.league_id = l.id and m.team_id is not null and not coalesce(t.is_guest, false)) claimed,
           (select count(*) from members m where m.league_id = l.id) members,
           (select count(*) from join_requests j where j.league_id = l.id and j.status = 'pending') pending,
           (select count(*) from game_lineups g where g.league_id = l.id) lineups,
           (select count(*) from trades tr where tr.league_id = l.id) trades,
           (select count(*) from kc_share_trades s where s.league_id = l.id) share_trades,
           (select max(u.last_sign_in_at) from members m join auth.users u on u.id = m.user_id where m.league_id = l.id) last_sign_in,
           greatest(
             (select max(g.updated_at) from game_lineups g where g.league_id = l.id),
             (select max(tr.created_at) from trades tr where tr.league_id = l.id),
             (select max(s.created_at) from kc_share_trades s where s.league_id = l.id),
             (select max(m.created_at) from members m where m.league_id = l.id),
             (select max(j.created_at) from join_requests j where j.league_id = l.id),
             (select max(sl.at) from score_log sl where sl.league_id = l.id),
             l.created_at) last_activity
      from leagues l left join league_plans p on p.league_id = l.id
  )
  select jsonb_build_object(
    'now', now(),
    'metrics', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'active_1d', (select count(*) from auth.users where last_sign_in_at > now() - interval '1 day'),
      'no_league', (select count(*) from auth.users u where not exists (select 1 from members m where m.user_id = u.id)),
      'leagues', (select count(*) from leagues),
      'clubs', (select coalesce(sum(clubs), 0) from lg),
      'claimed', (select coalesce(sum(claimed), 0) from lg)),
    'leagues', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'created_at', created_at, 'season', season, 'setup_mode', setup_mode,
        'squads_locked_at', squads_locked_at, 'plan', plan, 'founding', founding, 'pro_until', pro_until, 'is_pro', is_pro,
        'clubs', clubs, 'claimed', claimed, 'members', members, 'pending', pending, 'lineups', lineups, 'trades', trades,
        'share_trades', share_trades, 'last_sign_in', last_sign_in, 'last_activity', last_activity,
        'dates', settings -> 'rules' -> 'dates', 'draft_day', settings -> 'rules' -> 'dates' ->> 'draft_day',
        'coaches', coalesce((select jsonb_agg(jsonb_build_object('team', t.name, 'guest', coalesce(t.is_guest, false),
              'email', m.email, 'commish', coalesce(m.is_commish, false), 'last_sign_in', u.last_sign_in_at) order by t.name)
            from teams t left join members m on m.team_id = t.id and m.league_id = t.league_id
            left join auth.users u on u.id = m.user_id where t.league_id = lg.id), '[]'::jsonb)
      ) order by id) from lg), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
        'email', u.email, 'created_at', u.created_at, 'last_sign_in', u.last_sign_in_at, 'confirmed', u.email_confirmed_at is not null,
        'admin', exists (select 1 from site_admins a where a.user_id = u.id),
        'leagues', coalesce((select jsonb_agg(jsonb_build_object('league', l.name, 'team', t.name, 'commish', coalesce(m.is_commish, false)))
            from members m join leagues l on l.id = m.league_id left join teams t on t.id = m.team_id where m.user_id = u.id), '[]'::jsonb)
      ) order by u.created_at desc) from auth.users u), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(a order by at desc) from (
        select u.created_at at, jsonb_build_object('at', u.created_at, 'kind', 'signup', 'text', 'New user signed up', 'who', u.email) a from auth.users u
        union all select l.created_at, jsonb_build_object('at', l.created_at, 'kind', 'league', 'text', 'League created', 'league', l.name) from leagues l
        union all select m.created_at, jsonb_build_object('at', m.created_at, 'kind', 'claim', 'text', 'Coach joined ' || coalesce(t.name, 'a league'), 'league', l.name, 'who', m.email)
          from members m join leagues l on l.id = m.league_id left join teams t on t.id = m.team_id
        union all select j.created_at, jsonb_build_object('at', j.created_at, 'kind', 'join', 'text', 'Join request (' || j.status || ')', 'league', l.name, 'who', j.email)
          from join_requests j join leagues l on l.id = j.league_id
        union all select tr.created_at, jsonb_build_object('at', tr.created_at, 'kind', 'trade', 'text', 'Trade ' || coalesce(tr.status, 'proposed'), 'league', l.name)
          from trades tr join leagues l on l.id = tr.league_id
        union all select s.created_at, jsonb_build_object('at', s.created_at, 'kind', 'shares', 'text', t.name || ' ' || case when s.side = 'buy' then 'bought ' else 'sold ' end || s.qty || ' share' || case when s.qty = 1 then '' else 's' end, 'league', l.name)
          from kc_share_trades s join leagues l on l.id = s.league_id left join teams t on t.id = s.team_id
        order by 1 desc limit 40) x), '[]'::jsonb),
    'health', jsonb_build_object(
      'stats', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'last', last, 'lines', lines, 'season', season))
          from (select source, max(fetched_at) last, count(*) lines, max(season) season from stat_lines group by source) s), '[]'::jsonb),
      'score_log_last', (select max(at) from score_log),
      'pending_joins', (select count(*) from join_requests where status = 'pending'),
      'unconfirmed', (select count(*) from auth.users where email_confirmed_at is null))
  ) into out;
  return out;
end $$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
