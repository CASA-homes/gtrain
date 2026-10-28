-- Clubhouse lineup: each player's spot within his line (0 = top), so coaches can order players and leave gaps.
alter table public.squad add column if not exists lineup_pos smallint;
