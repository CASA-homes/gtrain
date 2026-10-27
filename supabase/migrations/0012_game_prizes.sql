-- Live Matchups: optional prize per game (cost per club, payout split, and any other prizes as free text).
-- The site only shows and tracks it; money is settled between the coaches.
alter table mini_games add column if not exists prize jsonb;
