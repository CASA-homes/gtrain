-- Free agents: you can offer his market value, for any length.
create or replace function public.kc_offer(faid bigint, p_years int, p_salary int, new_tier text, sweet int, picks_in int[]) returns int language plpgsql security definer set search_path = public as $$
declare f kc_free_agents; k kc_settings; me int := public.my_team_id(); minimum int; old kc_offers; sc int; check_season int;
begin
  select * into k from kc_settings where league_id = public.current_league();
  if me is null then raise exception 'Sign in as a coach'; end if;
  select * into f from kc_free_agents where id = faid and status = 'open' and league_id = public.current_league();
  if f is null then raise exception 'He''s no longer a free agent'; end if;
  if f.ex_team = me and f.kind = 'pending' then raise exception 'He''s yours. You can''t bid on your own player'; end if;
  if f.closes_at is not null and f.closes_at < now() then raise exception 'Offers for him have closed'; end if;
  if p_years < 1 or p_years > k.max_years then raise exception 'Contracts run 1 to % years', k.max_years; end if;
  if new_tier not in ('standard', 'high', 'none') then raise exception 'Pick a release clause'; end if;
  minimum := greatest(5, public.kc_rate(f.player_id));
  if p_salary < minimum then raise exception 'The minimum is his market value: $%k a year', minimum; end if;
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

grant create on schema public to khq_definer;
alter function public.kc_offer(bigint, int, int, text, int, int[]) owner to khq_definer;
revoke create on schema public from khq_definer;
