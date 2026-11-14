-- Free-agent offers are blind: a club sees only its own offers (the commish sees all). Everyone can see how many.
drop policy if exists "kc_offers: members read" on public.kc_offers;
drop policy if exists "kc_offers: own club or commish" on public.kc_offers;
create policy "kc_offers: own club or commish" on public.kc_offers for select
  using (team_id = (select public.my_team_id()) or (select public.is_commish()));

create or replace function public.kc_offer_counts() returns table (fa_id bigint, offers int) language sql stable security definer set search_path = public as $$
  select fa_id, count(*)::int from kc_offers where status = 'tabled' and league_id = public.current_league() group by fa_id
$$;
grant create on schema public to khq_definer;
alter function public.kc_offer_counts() owner to khq_definer;
revoke create on schema public from khq_definer;
