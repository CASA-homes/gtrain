-- 0100 · Value engine: within a player's last 30 games, the newest 10 count 1.5×.
-- His average reacts sooner to current form (a player lifting all season climbs from the first rounds instead of
-- stalling while his old good games roll off), while a single game still moves it little. Same window, same ranking,
-- same rank curve; the ranking (kc_value_table) is rebuilt with the weighted averages.

create or replace function public.kc_value_steps(p_hist jsonb, p_logs jsonb, p_season int)
returns numeric[] language plpgsql immutable set search_path = public as $$
declare
  games numeric[] := '{}'; sc numeric[]; h record; i0 int := 0; n int; i int; j int; s numeric; ws numeric; w numeric; g int;
  out numeric[] := '{}';
begin
  for h in select (e->>0)::int y, (e->>1)::numeric g, (e->>2)::numeric a from jsonb_array_elements(coalesce(p_hist, '[]')) e
           where (e->>1)::numeric > 0 and (e->>0)::int <= p_season order by 1 loop
    if p_logs ? h.y::text and jsonb_array_length(p_logs -> h.y::text) > 0 then
      select coalesce(array_agg(case when jsonb_typeof(x) = 'array' then (x->>1)::numeric else (x #>> '{}')::numeric end order by o), '{}') into sc
        from jsonb_array_elements(p_logs -> h.y::text) with ordinality q(x, o)
       where (jsonb_typeof(x) = 'array' and jsonb_typeof(x->1) = 'number') or jsonb_typeof(x) = 'number';
    else
      sc := array_fill(h.a, array[h.g::int]);
    end if;
    if h.y < 2026 then i0 := i0 + coalesce(array_length(sc, 1), 0); end if;
    games := games || sc;
  end loop;
  n := coalesce(array_length(games, 1), 0);
  for i in i0 .. n loop
    s := 0; ws := 0; g := 0;
    for j in greatest(1, i - 29) .. i loop
      w := case when j > i - 10 then 1.5 else 1 end;
      s := s + games[j] * w; ws := ws + w; g := g + 1;
    end loop;
    out := out || array[[case when g > 0 then round(s / ws, 3) end, g::numeric]];
  end loop;
  return out;
end $$;

select public.kc_refresh_rates(null, null);
