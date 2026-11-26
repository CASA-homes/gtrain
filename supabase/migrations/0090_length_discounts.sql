-- 0090 · Bigger reward for long deals: 1 year +10%, 2 years +5%, 3 years market, 4 years −7.5%, 5 years −15%
-- (was +6 / +3 / 0 / −3.3 / −6.7). Used by signings, extensions, free-agent offers and clause buys.
-- Signed contracts don't change. lib/contracts.ts LENGTH_FACTOR mirrors it.
create or replace function public.kc_length_factor(years integer) returns numeric language sql immutable as $$
  select case years when 1 then 1.10 when 2 then 1.05 when 3 then 1.0 when 4 then 0.925 else 0.85 end
$$;
