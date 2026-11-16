-- Draft-day contracts and contract-length pricing.
--  • Draft price by pick: top 10 overall $30k, rest of R1 and R2 $25k, R3 $20k, R4 $15k, R5+ $10k.
--    Rookies (10 or fewer games) pay half, rounded up to the whole $k (12.5 → 13, 7.5 → 8).
--  • Rookies sign for 2 years, established players for 1. Both are protected (no clause) until the
--    mid-season window. Before it, the club gets a contract request and picks standard, high or no clause:
--    the salary takes that clause's premium and the clause is set from his market value at that point.
--    Any request left open defaults to standard when the mid-season window opens.
--  • Length pricing on extensions and free-agent offers: 1 yr +6%, 2 yrs +3%, 3 yrs flat, 4 yrs −3.3%, 5 yrs −6.7%.

alter table public.kc_contracts add column if not exists draft_review boolean not null default false;

grant create on schema public to khq_definer;

drop function if exists public.kc_draft_salary(int, boolean);
create or replace function public.kc_draft_salary(p_overall int, rnd int, rookie boolean) returns int language sql immutable as $$
  select ceil((case when rnd <= 1 and coalesce(p_overall, 99) <= 10 then 30
                    when rnd <= 2 then 25 when rnd = 3 then 20 when rnd = 4 then 15 else 10 end)
              * case when rookie then 0.5 else 1 end)::int
$$;

create or replace function public.kc_sign_draftees() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; n int;
begin
  if not public.is_commish() then raise exception 'Only the commish can price the draft'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, draft_review)
  select x.player_id, x.team_id, public.kc_draft_salary(x.overall, x.rnd, x.rk), public.kc_draft_salary(x.overall, x.rnd, x.rk),
         k.season, k.season + case when x.rk then 1 else 0 end, 'protected', x.rk, true, 'draft', true
    from (
      select s.player_id, s.team_id, coalesce(p.career_games, 0) <= 10 rk,
             coalesce(dp.round, 4) rnd, dp.overall
        from squad s join players p on p.id = s.player_id
        left join lateral (select d.round, d.overall from draft_room_picks d
                            where d.year = k.season and d.league_id = public.current_league()
                              and (d.player_key = s.player_id::text or (d.player ->> 'id') = s.player_id::text)
                            order by d.overall limit 1) dp on true
       where s.league_id = public.current_league()
         and not exists (select 1 from kc_contracts c where c.player_id = s.player_id and c.status = 'active' and c.league_id = s.league_id)
    ) x;
  get diagnostics n = row_count;
  perform public.kc_log(null::int, null, null, 'draft', 0, 0, n || ' draftees signed (rookies 2 yrs, established 1 yr), protected until the mid-season window');
  return n;
end $$;

-- The club answers a draftee's contract request: pick his clause before the mid-season window.
create or replace function public.kc_draft_review(cid bigint, new_tier text) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; sal int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and draft_review and league_id = public.current_league() for update;
  if c is null then raise exception 'He has no contract request open'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can answer that'; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  sal := round(c.base_k * public.kc_premium(new_tier))::int;
  update kc_contracts set tier = new_tier, salary_k = sal, draft_review = false,
         clause_kt = case when new_tier = 'none' then null else public.kc_clause_at(c.player_id, new_tier, c.league_id) end,
         updated_at = now()
   where id = cid;
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'draft', 0, 0, 'Draft deal set: ' || new_tier || ' clause at $' || sal || 'k');
  return sal;
end $$;

-- Any open requests default to standard.
create or replace function public.kc_close_draft_reviews() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update kc_contracts c set tier = 'standard', salary_k = c.base_k, draft_review = false,
         clause_kt = public.kc_clause_at(c.player_id, 'standard', c.league_id), updated_at = now()
   where c.draft_review and c.status = 'active' and c.league_id = public.current_league();
  get diagnostics n = row_count;
  if n > 0 then perform public.kc_log(null::int, null, null, 'draft', 0, 0, n || ' draft deals defaulted to a standard clause'); end if;
  return n;
end $$;

create or replace function public.kc_window(p_open boolean, p_kind text default 'preseason', p_hours int default 72) returns void language plpgsql security definer set search_path = public as $$
declare k kc_settings;
begin
  if not public.is_commish() then raise exception 'Only the commish can open or close windows'; end if;
  if p_kind not in ('preseason', 'midseason') then raise exception 'Window is preseason or midseason'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  if p_open then
    if p_kind = 'midseason' then perform public.kc_close_draft_reviews(); end if;
    update kc_settings set window_open = true, window_kind = p_kind, window_opened_at = now(), window_closes_at = now() + make_interval(hours => greatest(1, p_hours)), updated_at = now()
     where league_id = public.current_league();
  else
    update kc_settings set window_open = false, updated_at = now() where league_id = public.current_league();
    if k.window_kind = 'midseason' and k.midseason_at is null then perform public.kc_start_midseason(); end if;
  end if;
end $$;

-- Extensions: priced by length too (3 more years = flat).
create or replace function public.kc_extend(cid bigint, p_years int, new_tier text) returns int language plpgsql security definer set search_path = public as $$
declare c kc_contracts; k kc_settings; base int; sal int; last_yr int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into c from kc_contracts where id = cid and status = 'active' and league_id = public.current_league() for update;
  if c is null then raise exception 'That contract isn''t active'; end if;
  if c.team_id is distinct from public.my_team_id() and not public.is_commish() then raise exception 'Only his club can extend him'; end if;
  if public.kc_is_pending(c.player_id) then raise exception 'He''s a pending free agent now. Take an offer, or he goes to free agency at season end'; end if;
  if public.kc_moving(c.player_id, c.team_id) then raise exception 'He''s agreed to join another club'; end if;
  if c.draft_review then raise exception 'Answer his draft contract request first'; end if;
  if exists (select 1 from kc_contracts where player_id = c.player_id and status = 'pending' and league_id = public.current_league()) then
    raise exception 'He''s already extended';
  end if;
  if c.locked_until is not null and c.locked_until > now() then
    raise exception 'He was extended recently. He can be extended again from %', to_char(c.locked_until at time zone 'Australia/Perth', 'DD Mon YYYY');
  end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  last_yr := k.season + k.max_years - 1;
  if p_years < 1 or c.end_season + p_years > last_yr then
    raise exception 'He can be signed to % at most (% more year%)', last_yr, greatest(0, last_yr - c.end_season), case when last_yr - c.end_season = 1 then '' else 's' end;
  end if;
  if public.kc_bank(c.team_id) < k.ext_fee_kt then raise exception 'An extension costs a % KT fee. You have %', k.ext_fee_kt, public.kc_bank(c.team_id); end if;
  base := greatest(5, round(public.kc_rate(c.player_id) * public.kc_length_factor(p_years)
                            * case when c.home_grown then (100 - k.home_grown_pct) / 100.0 else 1 end * (100 + k.ext_premium_pct) / 100.0))::int;
  sal := round(base * public.kc_premium(new_tier))::int;
  if k.ext_fee_kt > 0 then perform public.kc_pay(c.team_id, -k.ext_fee_kt, 'Extension fee: ' || public.kc_pname(c.player_id)); end if;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status, locked_until)
  values (c.player_id, c.team_id, base, sal, c.end_season + 1, c.end_season + p_years, new_tier, false, c.home_grown, 'extension', 'pending', now() + interval '12 months');
  update kc_contracts set locked_until = now() + interval '12 months' where id = c.id;
  perform public.kc_log(c.player_id, c.team_id, c.team_id, 'extension', k.ext_fee_kt, 0, p_years || ' more yrs at $' || sal || 'k from ' || (c.end_season + 1) || ' (' || k.ext_fee_kt || ' KT fee)');
  return sal;
end $$;

-- Free-agent offers: the minimum is his market value adjusted for length.
create or replace function public.kc_offer(faid bigint, p_years integer, p_salary integer, new_tier text, sweet integer, picks_in integer[]) returns integer language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; k kc_settings; me int := public.my_team_id(); minimum int; old kc_offers; sc int; check_season int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  select * into f from kc_free_agents where id = faid and status = 'open' and league_id = public.current_league();
  if f is null then raise exception 'He''s no longer a free agent'; end if;
  if f.ex_team = me and f.kind in ('pending', 'offseason') then raise exception 'He''s yours. You can''t bid on your own player'; end if;
  if f.closes_at is not null and f.closes_at < now() then raise exception 'Offers for him have closed'; end if;
  if p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  minimum := greatest(5, round(public.kc_rate(f.player_id) * public.kc_length_factor(p_years)))::int;
  if p_salary < minimum then raise exception 'The minimum for % year% is $%k a year', p_years, case when p_years = 1 then '' else 's' end, minimum; end if;
  if sweet < 0 then raise exception 'The fee can''t be negative'; end if;
  if exists (select 1 from unnest(coalesce(picks_in, '{}')) pid where not exists (select 1 from picks where id = pid and owner_team_id = me)) then
    raise exception 'You can only offer picks you own';
  end if;
  check_season := k.season;
  if f.kind = 'pending' then check_season := k.season + 1; end if;
  if public.kc_salary(me, check_season) + round(p_salary * public.kc_premium(new_tier)) > k.season_cap_k then
    raise exception 'That salary would take you over the $%k season cap in %', k.season_cap_k, check_season;
  end if;
  sc := public.kc_offer_score(p_years, p_salary, sweet, coalesce(picks_in, '{}'));
  select * into old from kc_offers where fa_id = faid and team_id = me for update;
  if old.id is not null then
    if old.status <> 'tabled' then raise exception 'That offer has already been decided'; end if;
    if sc < old.score then raise exception 'A tabled offer can only go up (yours scores %)', old.score; end if;
    if public.kc_bank(me) < sweet - old.sweet_kt then raise exception 'Not enough tokens'; end if;
    perform public.kc_pay(me, -(sweet - old.sweet_kt), 'Offer held: ' || public.kc_pname(f.player_id));
    update kc_offers set years = p_years, salary_k = p_salary, tier = new_tier, sweet_kt = sweet, pick_ids = coalesce(picks_in, '{}'), score = sc, updated_at = now() where id = old.id;
  else
    if public.kc_bank(me) < sweet then raise exception 'Not enough tokens'; end if;
    perform public.kc_pay(me, -sweet, 'Offer held: ' || public.kc_pname(f.player_id));
    insert into kc_offers (fa_id, player_id, team_id, years, salary_k, tier, sweet_kt, pick_ids, score)
    values (faid, f.player_id, me, p_years, p_salary, new_tier, sweet, coalesce(picks_in, '{}'), sc);
  end if;
  return sc;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('kc_sign_draftees', 'kc_draft_review', 'kc_close_draft_reviews', 'kc_window', 'kc_extend', 'kc_offer')
  loop execute format('alter function %s owner to khq_definer', r.sig); end loop;
end $$;
revoke create on schema public from khq_definer;
grant execute on function public.kc_draft_review(bigint, text) to authenticated;
revoke execute on function public.kc_close_draft_reviews() from public, anon, authenticated;
