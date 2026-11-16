-- Applied live as 0053-0056: kc_rates reads only the cache (refilling it if short); khq_definer-owned functions can read/write the cache and data stamp.
create or replace function public.kc_rates() returns table(player_id integer, rate_k integer) language plpgsql volatile security definer set search_path = public as $$
declare lg int := public.current_league();
begin
  if (select count(*) from kc_rate_cache c where c.league_id = lg) < (select count(*) from players) then
    perform public.kc_refresh_rates(lg, null);
  end if;
  return query select c.player_id, c.rate_k from kc_rate_cache c where c.league_id = lg;
end $$;
grant select, insert, update, delete on public.kc_rate_cache to khq_definer;
create policy kc_rate_cache_definer on public.kc_rate_cache for all to khq_definer using (true) with check (true);
grant select, update on public.data_version to khq_definer;
create policy data_version_definer on public.data_version for all to khq_definer using (true) with check (true);
