-- Sign-up with a league code: a brand-new email must be able to create an account first, then ask to join.
-- The trigger used to refuse any email not already invited, which broke the league-code sign-up
-- ("Database error saving new user"). Now it just joins invited leagues; everyone else waits for the commish.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (user_id, email, team_id, is_commish, league_id)
  select new.id, lower(new.email), a.team_id, a.is_commish, a.league_id
    from public.allowed_emails a where a.email = lower(new.email)
  on conflict (user_id, league_id) do nothing;
  return new;
end $$;
