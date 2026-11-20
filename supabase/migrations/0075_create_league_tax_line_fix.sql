-- create_league: insert tax_line_k as a valid placeholder (it's recalculated straight after).
do $$
declare src text;
begin
  src := pg_get_functiondef('public.create_league(text, text, text, jsonb)'::regprocedure);
  src := replace(src, E'    0, 0, greatest(0, least(coalesce((p_rules ->> ''start_kt'')::int, 1000), 100000)), 5,', E'    1000, 0, greatest(0, least(coalesce((p_rules ->> ''start_kt'')::int, 1000), 100000)), 5,');
  execute src;
end $$;
