-- Coaches can cancel a tabled free-agent offer before it's decided. Any KT held for it comes back and the offer is removed,
-- so the club can table a fresh one later.
grant create on schema public to khq_definer;
create or replace function public.kc_withdraw_offer(oid bigint) returns int language plpgsql security definer set search_path = public as $$
declare o kc_offers;
begin
  select * into o from kc_offers where id = oid and league_id = public.current_league() for update;
  if o is null then raise exception 'No such offer'; end if;
  if o.team_id is distinct from public.my_team_id() then raise exception 'Only the club that made it can cancel it'; end if;
  if o.status <> 'tabled' then raise exception 'That offer has already been decided'; end if;
  if o.sweet_kt > 0 then perform public.kc_pay(o.team_id, o.sweet_kt, 'Offer cancelled: ' || public.kc_pname(o.player_id)); end if;
  delete from kc_offers where id = o.id;
  perform public.kc_log(o.player_id, o.team_id, null, 'free_agent', 0, 0, 'Offer withdrawn');
  return o.sweet_kt;
end $$;
alter function public.kc_withdraw_offer(bigint) owner to khq_definer;
revoke create on schema public from khq_definer;
grant execute on function public.kc_withdraw_offer(bigint) to authenticated;
