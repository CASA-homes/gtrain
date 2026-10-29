-- Club logos: each coach can upload their own club picture in place of the two-letter badge.
alter table public.teams add column if not exists logo_url text;

insert into storage.buckets (id, name, public) values ('club-logos', 'club-logos', true) on conflict do nothing;

-- Files live at <team_id>/<anything>; a coach writes only under their own club, the commish under any.
drop policy if exists "coaches upload club logo" on storage.objects;
create policy "coaches upload club logo" on storage.objects for insert to authenticated
  with check (bucket_id = 'club-logos' and (public.is_commish() or split_part(name, '/', 1) = public.my_team_id()::text));
drop policy if exists "coaches replace club logo" on storage.objects;
create policy "coaches replace club logo" on storage.objects for update to authenticated
  using (bucket_id = 'club-logos' and (public.is_commish() or split_part(name, '/', 1) = public.my_team_id()::text));
drop policy if exists "coaches remove club logo" on storage.objects;
create policy "coaches remove club logo" on storage.objects for delete to authenticated
  using (bucket_id = 'club-logos' and (public.is_commish() or split_part(name, '/', 1) = public.my_team_id()::text));

-- Point a club at its logo (or clear it). Only that club's coach or the commish; only club-logos URLs.
create or replace function public.set_team_logo(team int, url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_commish() or public.my_team_id() = team) then
    raise exception 'Only that club''s coach or the commish can change its logo';
  end if;
  if url is not null and url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/club-logos/' then
    raise exception 'Logo must be uploaded to the club-logos bucket';
  end if;
  update public.teams set logo_url = url where id = team;
end $$;
grant execute on function public.set_team_logo(int, text) to authenticated;
