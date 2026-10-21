-- Who can sign in. Fill in each coach's email (lower case), then run this in the Supabase SQL editor.
-- Set is_commish = true for the commissioner: they approve trades, post news and fix squads.
-- Add or change people later with the same statement; existing rows are updated.
insert into public.allowed_emails (email, team_id, is_commish)
select lower(v.email), t.id, v.is_commish
from (values
  ('christian@EXAMPLE.com', 'Bodega Boys',            false),
  ('zac@EXAMPLE.com',       'Serong So’Right',         false),
  ('michaelm@EXAMPLE.com',  'Muzza''s Murabito''s',    false),
  ('michaelf@EXAMPLE.com',  'Such Is Fyfe',            false),
  ('mitchell@EXAMPLE.com',  'Pato''s Fantasy Team',    false),
  ('stan@EXAMPLE.com',      'NSW-ACT Academy',         false),
  ('seann@EXAMPLE.com',     'A Brayshaw Thing',        false),
  ('alexander@EXAMPLE.com', 'Fo’ Sheezel my Neezel',   false),
  ('mathew@EXAMPLE.com',    'Bito’s Boys',             false),
  ('jake@EXAMPLE.com',      'Ram Dawgs',               false)
) as v(email, team, is_commish)
join public.teams t on t.name = v.team
where v.email not like '%EXAMPLE.com'
on conflict (email) do update set team_id = excluded.team_id, is_commish = excluded.is_commish;
