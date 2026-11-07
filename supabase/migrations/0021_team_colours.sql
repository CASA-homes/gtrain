-- Club colours: each coach picks a highlight colour for their clubhouse, score worm and matchup colours.
alter table public.teams add column if not exists colour text
  check (colour is null or colour ~ '^#[0-9a-fA-F]{6}$');

create or replace function public.set_team_colour(team int, colour text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_commish() or public.my_team_id() = team) then
    raise exception 'Only that club''s coach or the commish can change its colour';
  end if;
  if colour is not null and colour !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Colour must be a hex value like #2563c9';
  end if;
  update public.teams set colour = set_team_colour.colour where id = team;
end $$;
grant execute on function public.set_team_colour(int, text) to authenticated;
