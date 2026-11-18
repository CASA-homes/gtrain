-- Commish can scrap a comp's KT entry fee while nobody has paid in yet.
create policy "commish removes empty comp pots" on public.kt_pots for delete to authenticated
  using ((select public.is_commish()) and kind = 'comp' and status = 'open' and not exists (select 1 from public.kt_pot_entries e where e.pot_id = id));
grant delete on public.kt_pots to authenticated;
