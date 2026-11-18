-- Multi-club trades: any club on the desk can add a move between any two clubs on it (e.g. club C's player to club A).
-- Every club that sends or receives still has to accept, so nobody can be traded into something they didn't agree to.
drop policy if exists "add items involving own team" on public.desk_items;
create policy "add items as a party" on public.desk_items for insert with check (
  added_by_team = (select public.my_team_id())
  and exists (select 1 from public.desk_teams t where t.desk_id = desk_items.desk_id and t.team_id = (select public.my_team_id()))
);
drop policy if exists "remove items involving own team" on public.desk_items;
create policy "remove items as a party" on public.desk_items for delete using (
  exists (select 1 from public.desk_teams t where t.desk_id = desk_items.desk_id and t.team_id = (select public.my_team_id()))
);
