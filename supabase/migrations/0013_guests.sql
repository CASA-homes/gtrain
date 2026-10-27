-- Guests: people without a G-Train club who can view the site and play the Live Matchups mini games.
-- Each guest gets a guest club (is_guest = true). Guest clubs are left out of every league view (ladder, rankings,
-- trades, keepers); league actions refuse guests in the app, and guests have no squad or picks to change.
-- Invite a guest from the SQL editor (not committed here, the repo is public):
--   insert into teams (name, coach_name, short_code, is_guest) values ('<Name> (guest)', '<Name>', '<ABC>', true);
--   insert into allowed_emails (email, team_id) select '<email>', id from teams where name = '<Name> (guest)';
alter table teams add column if not exists is_guest boolean not null default false;
