-- Release clauses apply until a player's last 6 months. A final-year player keeps his clause through the mid-season
-- window; when the window closes, anyone not re-signed becomes a free agent (pending) and the clause goes.
create or replace function public.kc_clause(cid bigint) returns int language sql stable security definer set search_path = public as $$
  select case when c.tier in ('none', 'protected') or public.kc_is_pending(c.player_id)
                or (c.end_season <= k.season and k.midseason_at is not null) then null
    else coalesce(c.clause_kt, public.kc_clause_at(c.player_id, c.tier, c.league_id)) end
    from kc_contracts c join kc_settings k on k.league_id = c.league_id
   where c.id = cid and c.league_id = public.current_league()
$$;

-- Final-year players not re-signed (and not mid-clause) become pending free agents.
create or replace function public.kc_start_midseason() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; n int;
begin
  if not public.is_commish() then raise exception 'Only the commish can do that'; end if;
  select * into k from kc_settings where league_id = public.current_league() for update;
  if k.midseason_at is not null then raise exception 'Final-year players are already free agents this season'; end if;
  insert into kc_free_agents (player_id, ex_team, kind)
  select c.player_id, c.team_id, 'pending' from kc_contracts c
   where c.status = 'active' and c.end_season <= k.season and c.league_id = public.current_league()
     and not exists (select 1 from kc_contracts x where x.player_id = c.player_id and x.status = 'pending' and x.league_id = c.league_id)
     and not exists (select 1 from kc_claims cl where cl.contract_id = c.id and cl.status = 'pending')
  on conflict do nothing;
  get diagnostics n = row_count;
  update kc_settings set midseason_at = now(), updated_at = now() where league_id = public.current_league();
  perform public.kc_log(null::int, null, null, 'pending', 0, 0, 'Mid-season window closed: ' || n || ' final-year players are now free agents');
  return n;
end $$;

-- Closing the mid-season window turns un-signed final-year players into free agents.
create or replace function public.kc_window(p_open boolean, p_kind text default 'preseason', p_hours int default 72) returns void language plpgsql security definer set search_path = public as $$
declare k kc_settings;
begin
  if not public.is_commish() then raise exception 'Only the commish can open or close windows'; end if;
  if p_kind not in ('preseason', 'midseason') then raise exception 'Window is preseason or midseason'; end if;
  select * into k from kc_settings where league_id = public.current_league();
  if p_open then
    update kc_settings set window_open = true, window_kind = p_kind, window_opened_at = now(), window_closes_at = now() + make_interval(hours => greatest(1, p_hours)), updated_at = now()
     where league_id = public.current_league();
  else
    update kc_settings set window_open = false, updated_at = now() where league_id = public.current_league();
    if k.window_kind = 'midseason' and k.midseason_at is null then perform public.kc_start_midseason(); end if;
  end if;
end $$;

-- A clause bought on a final-year player: he joins at season end on a one-season deal at his current salary.
create or replace function public.kc_complete_claim(claim_id bigint) returns text language plpgsql security definer set search_path = public as $$
declare cl kc_claims; c kc_contracts; k kc_settings; levy int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into cl from kc_claims where id = claim_id and status = 'pending' and league_id = public.current_league() for update;
  if cl is null then raise exception 'That clause isn''t pending'; end if;
  if cl.expires_at > now() and cl.seller_team is distinct from public.my_team_id() and not public.is_commish() then
    raise exception 'His club has until the 24 hours are up to match';
  end if;
  select * into c from kc_contracts where id = cl.contract_id and status = 'active' for update;
  if c is null or c.team_id <> cl.seller_team
     or public.kc_salary(cl.buyer_team, k.season + 1) + c.salary_k > k.season_cap_k then
    perform public.kc_pay(cl.buyer_team, cl.price_kt, 'Clause refunded: ' || public.kc_pname(cl.player_id));
    update kc_claims set status = 'cancelled' where id = cl.id;
    return 'cancelled';
  end if;
  levy := cl.price_kt * k.levy_pct / 100;
  perform public.kc_pay(cl.seller_team, cl.price_kt - levy, 'Sold on release clause: ' || public.kc_pname(cl.player_id));
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, rookie, home_grown, how, status)
  values (c.player_id, cl.buyer_team, c.base_k, c.salary_k, k.season + 1, greatest(c.end_season, k.season + 1), c.tier, c.rookie, false, 'clause', 'pending');
  update kc_contracts set end_season = k.season, updated_at = now() where id = c.id;
  update kc_auctions set status = 'cancelled' where contract_id = c.id and status = 'open';
  update kc_claims set status = 'completed' where id = cl.id;
  perform public.kc_log(cl.player_id, cl.seller_team, cl.buyer_team, 'clause', cl.price_kt, levy, 'Joins at season end');
  return 'completed';
end $$;

grant create on schema public to khq_definer;
alter function public.kc_clause(bigint) owner to khq_definer;
alter function public.kc_start_midseason() owner to khq_definer;
alter function public.kc_window(boolean, text, int) owner to khq_definer;
alter function public.kc_complete_claim(bigint) owner to khq_definer;
revoke create on schema public from khq_definer;
