-- 0079: every league gets its own draft room.
-- New leagues had no draft_room row, so Draft Centre "Save settings" updated nothing and the page showed the default date.
-- Additive and safe to re-run: G-Train's existing draft room is left exactly as it is.

create or replace function public.leagues_make_draft_room() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.draft_room (league_id, year) values (new.id, coalesce(new.season, 2027))
  on conflict (league_id, year) do nothing;
  return new;
end $$;
revoke all on function public.leagues_make_draft_room() from public, anon, authenticated;

drop trigger if exists leagues_make_draft_room on public.leagues;
create trigger leagues_make_draft_room after insert on public.leagues
  for each row execute function public.leagues_make_draft_room();

-- Backfill leagues that already exist without one (e.g. test leagues).
insert into public.draft_room (league_id, year)
select l.id, coalesce(l.season, 2027) from public.leagues l
on conflict (league_id, year) do nothing;
