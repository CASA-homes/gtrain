-- Commish: unlock a locked contract (or every locked one at a club) before deadline day, so it's provisional again.
grant create on schema public to khq_definer;
create or replace function public.kc_unlock_contracts(cid bigint, t int) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_commish() then raise exception 'Only the commish can unlock contracts'; end if;
  if not public.kc_in_setup() then raise exception 'Contracts are formal after deadline day'; end if;
  update kc_contracts set provisional = true, updated_at = now()
   where league_id = public.current_league() and status in ('active', 'pending') and not provisional and how in ('seed', 'extension')
     and (cid is null or id = cid) and (t is null or team_id = t);
  get diagnostics n = row_count;
  if n > 0 then perform public.kc_log(null::int, t, t, 'seed', 0, 0, n || ' contract' || case when n = 1 then '' else 's' end || ' unlocked by the commish'); end if;
  return n;
end $$;
alter function public.kc_unlock_contracts(bigint, int) owner to khq_definer;
revoke create on schema public from khq_definer;
grant execute on function public.kc_unlock_contracts(bigint, int) to authenticated;
