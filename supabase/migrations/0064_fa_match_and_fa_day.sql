-- Pending free agents: the owner's right to match. Every new top offer gives the player's club 48 hours to match it
-- (re-sign him on the same years and salary, no fee) or let him go (the bidder signs him and pays the transfer fee).
-- No answer in 48 hours = let go. Signings and contracts move on Free Agent Day (1 January), when the season rolls over.
alter table public.kc_free_agents add column if not exists match_offer bigint references public.kc_offers(id) on delete set null;
alter table public.kc_free_agents add column if not exists match_by timestamptz;
alter table public.kc_free_agents add column if not exists match_score int;
alter table public.kc_free_agents drop constraint if exists kc_free_agents_status_check;
alter table public.kc_free_agents add constraint kc_free_agents_status_check check (status in ('open', 'signed', 'unsigned', 'kept'));
alter table public.kc_settings add column if not exists fa_day date;

-- Free Agent Day: the setting, or 1 January after the current season.
create or replace function public.kc_fa_day() returns date language sql stable security definer set search_path = public as $$
  select coalesce(fa_day, make_date(season + 1, 1, 1)) from kc_settings where league_id = public.current_league();
$$;

-- Keep the "offer to match" pointed at the best tabled offer; a new or higher top offer restarts the 48 hours.
create or replace function public.kc_offer_match_track() returns trigger language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; top kc_offers;
begin
  select * into f from kc_free_agents where id = new.fa_id for update;
  if f is null or f.kind <> 'pending' or f.status <> 'open' then return new; end if;
  select * into top from kc_offers where fa_id = f.id and status = 'tabled' order by score desc, created_at limit 1;
  if top.id is null then
    update kc_free_agents set match_offer = null, match_by = null, match_score = null where id = f.id;
  elsif top.id is distinct from f.match_offer or top.score > coalesce(f.match_score, -1) then
    update kc_free_agents set match_offer = top.id, match_score = top.score, match_by = now() + interval '48 hours' where id = f.id;
  end if;
  return new;
end $$;
drop trigger if exists kc_offer_match_track on public.kc_offers;
create trigger kc_offer_match_track after insert or update of score, status on public.kc_offers for each row execute function public.kc_offer_match_track();

-- The owner matches: he re-signs on the bidder's years, salary and clause, from next season. All offers refunded.
create or replace function public.kc_match_offer(p_fa int) returns text language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; o kc_offers; k kc_settings; r record;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into f from kc_free_agents where id = p_fa and status = 'open' and kind = 'pending' and league_id = public.current_league() for update;
  if f is null then raise exception 'He''s not waiting on a match'; end if;
  if f.ex_team is distinct from public.my_team_id() then raise exception 'Only his club can match'; end if;
  if f.match_by is null or f.match_by < now() then raise exception 'The 48 hours to match have passed'; end if;
  select * into o from kc_offers where id = f.match_offer and status = 'tabled';
  if o is null then raise exception 'There''s no offer to match'; end if;
  if public.kc_salary(f.ex_team, k.season + 1) + round(o.salary_k * public.kc_premium(o.tier)) > k.season_cap_k then
    raise exception 'Matching would take you over the $%k season cap in %', k.season_cap_k, k.season + 1;
  end if;
  for r in select * from kc_offers where fa_id = f.id and status = 'tabled' loop
    perform public.kc_pay(r.team_id, r.sweet_kt, 'Offer refunded (matched): ' || public.kc_pname(f.player_id));
    update kc_offers set status = 'lost', updated_at = now() where id = r.id;
  end loop;
  insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how, status)
  values (f.player_id, f.ex_team, o.salary_k, round(o.salary_k * public.kc_premium(o.tier))::int, k.season + 1, k.season + o.years, o.tier, 'match', 'pending');
  update kc_free_agents set status = 'kept', match_offer = null, match_by = null where id = f.id;
  perform public.kc_log(f.player_id, f.ex_team, f.ex_team, 'extension', 0, 0,
    'Matched ' || (select short_code from teams where id = o.team_id) || '''s offer: ' || o.years || ' yrs at $' || round(o.salary_k * public.kc_premium(o.tier)) || 'k from ' || (k.season + 1));
  return 'matched';
end $$;

-- Owner lets him go (or 48 hours pass): the matched offer wins. Uses the normal accept path.
create or replace function public.kc_accept_offer(oid bigint) returns text language plpgsql security definer set search_path = public as $$
declare o kc_offers; f kc_free_agents; k kc_settings; r record; base int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  select * into o from kc_offers where id = oid and status = 'tabled' and league_id = public.current_league() for update;
  if o is null then raise exception 'That offer isn''t open'; end if;
  select * into f from kc_free_agents where id = o.fa_id and status = 'open' and kind in ('pending', 'offseason') for update;
  if f is null then raise exception 'He''s not taking offers'; end if;
  if f.ex_team is distinct from public.my_team_id() and not public.is_commish() and coalesce(current_setting('khq.system', true), '') <> '1' then
    raise exception 'Only his club can accept';
  end if;
  for r in select * from kc_offers where fa_id = f.id and status = 'tabled' and id <> o.id loop
    perform public.kc_pay(r.team_id, r.sweet_kt, 'Offer refunded: ' || public.kc_pname(f.player_id));
    update kc_offers set status = 'lost', updated_at = now() where id = r.id;
  end loop;
  update kc_offers set status = 'won', updated_at = now() where id = o.id;
  perform public.kc_pay(f.ex_team, o.sweet_kt, 'Transfer fee: ' || public.kc_pname(f.player_id));
  base := o.salary_k;
  if f.kind = 'offseason' then
    insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how, status)
    values (f.player_id, o.team_id, base, round(base * public.kc_premium(o.tier))::int, k.season, k.season + o.years - 1, o.tier, 'free_agent', 'active');
  else
    insert into kc_contracts (player_id, team_id, base_k, salary_k, start_season, end_season, tier, how, status)
    values (f.player_id, o.team_id, base, round(base * public.kc_premium(o.tier))::int, k.season + 1, k.season + o.years, o.tier, 'free_agent', 'pending');
  end if;
  update kc_free_agents set status = 'signed', signed_team = o.team_id, match_offer = null, match_by = null where id = f.id;
  perform public.kc_log(f.player_id, f.ex_team, o.team_id, 'free_agent', o.sweet_kt, 0,
    'Agreed: moves on Free Agent Day (' || to_char(public.kc_fa_day(), 'DD Mon YYYY') || '), ' || o.years || ' yrs at $' || round(base * public.kc_premium(o.tier)) || 'k'
    || case when array_length(o.pick_ids, 1) > 0 then ' + picks (noted only)' else '' end);
  return 'accepted';
end $$;

-- Settle any match windows that have run out. Safe for anyone to call; the site calls it when contracts load.
create or replace function public.kc_settle_matches() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform set_config('khq.system', '1', true);
  for r in select f.match_offer from kc_free_agents f where f.league_id = public.current_league() and f.status = 'open' and f.kind = 'pending'
           and f.match_by is not null and f.match_by < now() and f.match_offer is not null loop
    perform public.kc_accept_offer(r.match_offer);
    n := n + 1;
  end loop;
  perform set_config('khq.system', '', true);
  return n;
end $$;

grant create on schema public to khq_definer;
alter function public.kc_fa_day() owner to khq_definer;
alter function public.kc_offer_match_track() owner to khq_definer;
alter function public.kc_match_offer(int) owner to khq_definer;
alter function public.kc_accept_offer(bigint) owner to khq_definer;
alter function public.kc_settle_matches() owner to khq_definer;
revoke create on schema public from khq_definer;
revoke execute on function public.kc_match_offer(int), public.kc_settle_matches(), public.kc_fa_day() from anon, public;
grant execute on function public.kc_match_offer(int), public.kc_settle_matches(), public.kc_fa_day() to authenticated;

-- The rollover is Free Agent Day: it can't run before it.
create or replace function public.kc_rollover() returns int language plpgsql security definer set search_path = public as $$
declare k kc_settings; r record; n int := 0; bad text := ''; allow int;
begin
  if not public.is_commish() then raise exception 'Only the commish can roll the season over'; end if;
  select * into k from kc_settings where league_id = public.current_league() for update;
  if k.window_open then raise exception 'Close the window first'; end if;
  if current_date < public.kc_fa_day() then raise exception 'Free Agent Day is %. Players move and the season rolls over then', to_char(public.kc_fa_day(), 'DD Mon YYYY'); end if;
  for r in select id, name from teams where league_id = public.current_league() and not coalesce(is_guest, false) loop
    allow := k.deficit_max_k;
    if exists (select 1 from kc_cap_adjust where team_id = r.id and season = k.season + 1 and league_id = public.current_league()) then allow := 0; end if;
    if public.kc_kept_count(r.id, k.season + 1) > 18
       or public.kc_salary(r.id, k.season + 1) > public.kc_keeper_cap(r.id, k.season + 1) + allow then
      bad := bad || r.name || ', ';
    end if;
  end loop;
  if bad <> '' then raise exception 'These clubs are over the keeper cap or keeper limit: %', left(bad, length(bad) - 2); end if;
  for r in select id from teams where league_id = public.current_league() and not coalesce(is_guest, false) loop
    if public.kc_salary(r.id, k.season + 1) > public.kc_keeper_cap(r.id, k.season + 1) then perform public.kc_lockin(r.id); end if;
  end loop;
  for r in select * from kc_contracts where status = 'active' and end_season <= k.season and league_id = public.current_league() loop
    update kc_contracts set status = 'expired', updated_at = now() where id = r.id;
    if not exists (select 1 from kc_contracts where player_id = r.player_id and status = 'pending' and league_id = public.current_league()) then
      insert into kc_free_agents (player_id, ex_team) values (r.player_id, r.team_id) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  for r in select * from kc_deposits where status = 'open' and coalesce(matures_at <= now(), season <= k.season) and league_id = public.current_league() loop
    perform public.kc_pay(r.team_id, r.amount + r.amount * r.rate_pct / 100, 'Term deposit matured (+' || r.rate_pct || '%)');
    update kc_deposits set status = 'paid' where id = r.id;
  end loop;
  for r in select * from kc_loans where status = 'active' and season <= k.season and league_id = public.current_league() loop
    perform public.kc_pay(r.borrower, -(r.amount + r.amount * r.rate_pct / 100), 'Loan repaid to ' || (select short_code from teams where id = r.lender));
    perform public.kc_pay(r.lender, r.amount + r.amount * r.rate_pct / 100, 'Loan repaid by ' || (select short_code from teams where id = r.borrower));
    update kc_loans set status = 'repaid' where id = r.id;
  end loop;
  update kc_loans set status = 'cancelled' where status = 'offered' and league_id = public.current_league();
  update kc_free_agents set kind = 'open', closes_at = null, match_offer = null, match_by = null where status = 'open' and kind = 'pending' and league_id = public.current_league();
  update kc_contracts set status = 'active', updated_at = now() where status = 'pending' and start_season <= k.season + 1 and league_id = public.current_league();
  update kc_settings set season = k.season + 1, midseason_at = null, fa_day = null, updated_at = now() where league_id = public.current_league();
  insert into kc_ledger (team_id, delta, reason)
  select id, k.start_kt, (k.season + 1) || ' starting bank' from teams where league_id = public.current_league() and not coalesce(is_guest, false);
  perform public.kc_log(null::int, null, null, 'seed', 0, 0, 'Free Agent Day: rolled over to ' || (k.season + 1) || ', ' || n || ' free agents');
  return n;
end $$;
grant create on schema public to khq_definer;
alter function public.kc_rollover() owner to khq_definer;
revoke create on schema public from khq_definer;
