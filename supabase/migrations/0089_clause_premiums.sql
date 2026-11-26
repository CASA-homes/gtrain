-- 0089 · Clause premiums: a High clause costs +20% salary (was +10%), no clause +40% (was +25%).
-- Existing leagues, the column defaults and new leagues (create_league) all move. Signed contracts don't change.
-- Commish can still set both per league under League numbers.

update public.kc_settings set high_pct = 20, none_pct = 40;
alter table public.kc_settings alter column high_pct set default 20;
alter table public.kc_settings alter column none_pct set default 40;

do $$
declare src text;
begin
  select pg_get_functiondef('public.create_league(text, text, text, jsonb)'::regprocedure) into src;
  if position('100, 10, 25, greatest(0, least(coalesce((p_rules ->> ''home_grown_pct'')' in src) = 0 then
    raise exception 'create_league: clause premium defaults not found';
  end if;
  src := replace(src, '100, 10, 25, greatest(0, least(coalesce((p_rules ->> ''home_grown_pct'')',
                      '100, 20, 40, greatest(0, least(coalesce((p_rules ->> ''home_grown_pct'')');
  execute src;
end $$;
