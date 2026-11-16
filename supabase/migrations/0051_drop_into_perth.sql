-- Remove the Into Perth departures board (not part of Keeper HQ); it held DB connections waiting on HTTP calls.
drop schema if exists into_perth cascade;
