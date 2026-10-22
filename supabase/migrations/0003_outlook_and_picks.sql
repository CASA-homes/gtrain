-- 2027 outlook: player availability and commissioner status calls.

-- Retired / delisted / long-term injured. Non-null means he doesn't count in 2027 projections.
alter table public.players add column if not exists list_status text;

-- The commish can override a team's projected status (e.g. a known trade or retirement the model can't see).
alter table public.teams add column if not exists status_override text
  check (status_override in ('Strong contender', 'Top 4 contender', 'Mid-table', 'Rebuilding'));

-- Only the commish can change teams.
drop policy if exists "commish updates teams" on public.teams;
create policy "commish updates teams" on public.teams for update to authenticated
  using (public.is_commish()) with check (public.is_commish());

-- Players out for 2027 (sources: Zero Hanger retirements & delistings 2026; AFL.com.au on Mills)
update public.players p set list_status = v.status
from (values
  ('D. Prestia', 'RIC', 'Retired'),
  ('T. Liberatore', 'WBD', 'Retired'),
  ('A. Treloar', 'WBD', 'Retired'),
  ('Z. Williams', 'CAR', 'Delisted'),
  ('E. Tsatas', 'ESS', 'Delisted'),
  ('T. Sonsie', 'RIC', 'Delisted'),
  ('B. Camporeale', 'CAR', 'Delisted'),
  ('K. Smith', 'RIC', 'Delisted'),
  ('C. Mills', 'SYD', 'ACL: likely out for 2027')
) as v(name, club, status)
where p.name = v.name and p.afl_club = v.club;

-- Commissioner calls (Christian, 22 Oct 2026)
update public.teams set status_override = 'Strong contender' where name = 'Such Is Fyfe';
update public.teams set status_override = 'Top 4 contender' where name = 'Serong So’Right';
update public.teams set status_override = 'Rebuilding' where name = 'A Brayshaw Thing';

select name, afl_club, list_status from public.players where list_status is not null order by name;
