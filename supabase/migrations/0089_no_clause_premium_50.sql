-- 0089 · A no-clause contract costs more: +50% salary (was +25%). Can't be poached, so it should hurt the cap.
-- Existing leagues, the column default and new leagues (create_league) all move to 50. Signed contracts don't change.
-- Commish can still set it per league under League numbers.

update public.kc_settings set none_pct = 50 where none_pct < 50;
alter table public.kc_settings alter column none_pct set default 50;

do $$
declare src text;
begin
  select pg_get_functiondef('public.create_league(text, text, text, jsonb)'::regprocedure) into src;
  if position('100, 10, 25, greatest(0, least(coalesce((p_rules ->> ''home_grown_pct'')' in src) = 0 then
    raise exception 'create_league: no-clause default not found';
  end if;
  src := replace(src, '100, 10, 25, greatest(0, least(coalesce((p_rules ->> ''home_grown_pct'')',
                      '100, 10, 50, greatest(0, least(coalesce((p_rules ->> ''home_grown_pct'')');
  execute src;
end $$;
