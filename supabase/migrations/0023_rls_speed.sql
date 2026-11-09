-- Speed: row-level security checks once per query instead of once per row.
-- Policies like `using (is_member())` re-run the members lookup for every row read (the squad page reads ~1,000 rows
-- across squad, players and player_seasons). Wrapping the call as `(select is_member())` lets Postgres run it once.
-- Same rules, same access: this only changes how often the check runs. Safe to run more than once.
do $$
declare
  r record; nq text; nc text;
  fns text[] := array['is_member', 'is_commish', 'my_team_id'];
  f text;
begin
  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    nq := r.qual; nc := r.with_check;
    foreach f in array fns loop
      nq := regexp_replace(nq, '(?<!select )(public\.)?' || f || '\(\)', '(select public.' || f || '())', 'gi');
      nc := regexp_replace(nc, '(?<!select )(public\.)?' || f || '\(\)', '(select public.' || f || '())', 'gi');
    end loop;
    nq := regexp_replace(nq, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi');
    nc := regexp_replace(nc, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi');
    if nq is distinct from r.qual then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, nq);
    end if;
    if nc is distinct from r.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, nc);
    end if;
  end loop;
end $$;

-- The members lookup behind every check.
create index if not exists members_user_id_idx on public.members (user_id);
create index if not exists members_team_id_idx on public.members (team_id);
create index if not exists picks_owner_idx on public.picks (owner_team_id);
