-- 0094 · A draftee's market value starts at the full price of his league draft pick.
--
-- Before: his starting price was his contract salary, so a rookie's 50% discount (and whatever clause his coach later
-- picked) went into his market value: a top-10 rookie was worth $15k on draft day, or $21k with no clause.
-- Now: he starts at his pick's draft price ($30k top 10, $25k rest of R1 and R2, $20k R3, $15k R4, $10k after). Only the
-- coach who drafts him gets the rookie discount, on his salary. The clause he picks changes his salary, not his value.

create or replace function public.kc_pick_price(p_round int, p_overall int, p_league int) returns numeric
language sql stable security definer set search_path = public as $$
  select case when coalesce(p_round, 4) <= 1 and coalesce(p_overall, 99) <= 10 then coalesce(k.draft_r1_k, 30)
              when coalesce(p_round, 4) <= 2 then coalesce(k.draft_r2_k, 25) when p_round = 3 then coalesce(k.draft_r3_k, 20)
              when coalesce(p_round, 4) = 4 then coalesce(k.draft_r4_k, 15) else coalesce(k.draft_rest_k, 10) end::numeric
    from (select 1) x left join kc_settings k on k.league_id = p_league
$$;

-- Starting price from a league draft (or rookie) contract, if he has one: his pick's full price, read from the draft
-- room; without a recorded pick, the contract's base before any rookie discount or clause premium.
create or replace function public.kc_contract_start_price(pid int, p_league int) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
           (select public.kc_pick_price(d.round, d.overall, p_league) from draft_room_picks d
             where d.league_id = p_league and d.year = c.start_season and (d.player_key = pid::text or (d.player ->> 'id') = pid::text)
             order by d.overall limit 1),
           case when c.rookie then ceil(c.base_k / greatest(0.01, coalesce(k.rookie_pct, 50) / 100.0)) else c.base_k end)
    from kc_contracts c left join kc_settings k on k.league_id = p_league
   where c.player_id = pid and c.league_id = p_league and c.how in ('draft', 'rookie') and c.status <> 'voided'
   order by c.start_season, c.id limit 1
$$;

create or replace function public.kc_start_price(pid integer, p_league integer) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(10, coalesce(
    public.kc_contract_start_price(pid, p_league),
    (select case when p.draft_pick is null then coalesce(k.draft_rest_k, 10)
                 when p.draft_pick <= 10 then coalesce(k.draft_r1_k, 30) when p.draft_pick <= 25 then coalesce(k.draft_r2_k, 25)
                 when p.draft_pick <= 45 then coalesce(k.draft_r3_k, 20) when p.draft_pick <= 70 then coalesce(k.draft_r4_k, 15)
                 else coalesce(k.draft_rest_k, 10) end
       from players p left join kc_settings k on k.league_id = p_league where p.id = pid), 10))
$$;

-- The site's price graphs need the same starting prices: the players whose start comes from a league contract.
create or replace function public.kc_start_prices() returns table(player_id int, start_k numeric)
language sql stable security definer set search_path = public as $$
  select c.player_id, public.kc_start_price(c.player_id, c.league_id)
    from (select distinct player_id, league_id from kc_contracts
           where league_id = public.current_league() and how in ('draft', 'rookie') and status <> 'voided') c
$$;
revoke execute on function public.kc_start_prices() from anon, public;
grant execute on function public.kc_start_prices() to authenticated;

-- The draft room's picks move a draftee's value too.
create or replace function public.kc_rate_cache_pick() returns trigger language plpgsql security definer set search_path = public as $$
declare pid int := coalesce(nullif(new.player_key, '')::int, (new.player ->> 'id')::int);
begin
  if pid is not null and exists (select 1 from kc_contracts c where c.player_id = pid and c.league_id = new.league_id and c.how in ('draft', 'rookie')) then
    perform public.kc_refresh_rates(new.league_id, pid);
  end if;
  return null;
exception when invalid_text_representation then return null;
end $$;
drop trigger if exists kc_rate_cache_pick on public.draft_room_picks;
create trigger kc_rate_cache_pick after insert or update of round, overall, player_key, player on public.draft_room_picks
  for each row execute function public.kc_rate_cache_pick();

select public.kc_refresh_rates(null, null);
