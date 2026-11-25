-- 0082: launch security fixes (found in the pre-launch audit, 24 Nov 2026).
-- 1. desk_events: its "league scope" policy was PERMISSIVE (every other table has it RESTRICTIVE), so anyone,
--    signed out included, could read or add trade-desk events for any league. Writes only ever come from the
--    desk_propose / desk_accept / desk_decline server functions, which use "definer access", so nothing breaks.
-- 2. players is shared by every league, but "commish manages players" let the commish of ANY league edit it.
--    With open sign-up, anyone who starts a league could rename or delete players for everyone. Now only the
--    platform league's (G-Train, league 1) commish can, and server functions still work through "definer access".
-- 3. Signed-out visitors can no longer run the rate-cache rebuild (heavy query across every league and player).

-- 1.
drop policy if exists "league scope" on public.desk_events;
create policy "league scope" on public.desk_events as restrictive for all to public
  using (league_id = (select public.current_league()))
  with check (league_id = (select public.current_league()));

-- 2.
drop policy if exists "commish manages players" on public.players;
create policy "commish manages players" on public.players for all to authenticated
  using ((select public.current_league()) = 1 and (select public.is_commish()))
  with check ((select public.current_league()) = 1 and (select public.is_commish()));

-- 3.
revoke execute on function public.kc_refresh_rates(integer, integer) from anon, public;
revoke execute on function public.kc_charge_tax() from anon, public;
