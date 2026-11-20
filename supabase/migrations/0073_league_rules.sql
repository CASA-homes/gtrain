-- League-configurable rules for new leagues: keepers, list size, starting lineup, draftee salaries, rookie discount.
-- G-Train keeps today's values (the column defaults). Functions that hard-coded 18 keepers / 33-man lists now read them.

alter table public.kc_settings
  add column if not exists keepers int not null default 18 check (keepers between 6 and 30),
  add column if not exists list_size int not null default 33 check (list_size between 15 and 50),
  add column if not exists lineup jsonb not null default '{"DEF":5,"MID":7,"RUC":1,"FWD":5}',
  add column if not exists draft_r1_k int not null default 30,
  add column if not exists draft_r2_k int not null default 25,
  add column if not exists draft_r3_k int not null default 20,
  add column if not exists draft_r4_k int not null default 15,
  add column if not exists draft_rest_k int not null default 10,
  add column if not exists rookie_pct int not null default 50 check (rookie_pct between 10 and 100);

-- Draftee salary: from this league's settings (top-10 first-rounders, round 2, 3, 4, then everyone else), rookies discounted.
create or replace function public.kc_draft_salary(p_overall integer, rnd integer, rookie boolean)
returns integer language sql stable set search_path = public as $$
  select ceil((case when rnd <= 1 and coalesce(p_overall, 99) <= 10 then coalesce(k.draft_r1_k, 30)
                    when rnd <= 2 then coalesce(k.draft_r2_k, 25) when rnd = 3 then coalesce(k.draft_r3_k, 20)
                    when rnd = 4 then coalesce(k.draft_r4_k, 15) else coalesce(k.draft_rest_k, 10) end)
              * case when rookie then coalesce(k.rookie_pct, 50) / 100.0 else 1 end)::int
  from (select 1) x left join kc_settings k on k.league_id = public.current_league()
$$;

-- Keeper limit on the squad table: (keepers - 1) plus one rookie.
create or replace function public.check_keeper_limits() returns trigger language plpgsql set search_path = public as $$
declare n_keepers int; n_rookies int; lim int;
begin
  select coalesce((select keepers from kc_settings where league_id = new.league_id), 18) - 1 into lim;
  select count(*) filter (where is_keeper and not is_rookie_keeper), count(*) filter (where is_rookie_keeper)
    into n_keepers, n_rookies from public.squad where team_id = new.team_id;
  if n_keepers > lim then raise exception 'Keeper limit is % (plus one rookie)', lim; end if;
  if n_rookies > 1 then raise exception 'Only one rookie keeper allowed'; end if;
  return new;
end $$;

-- Swap the hard-coded numbers in the lock-in, rollover and trade-desk functions for the settings.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.kc_lockin(integer)'::regprocedure);
  src := replace(src, 'if kept > 18 then raise exception ''You''''re keeping % players. The most is 17 + 1 rookie'', kept; end if;',
                      'if kept > k.keepers then raise exception ''You''''re keeping % players. The most is % (including one rookie)'', kept, k.keepers; end if;');
  execute src;
  src := pg_get_functiondef('public.kc_rollover()'::regprocedure);
  src := replace(src, 'public.kc_kept_count(r.id, k.season + 1) > 18', 'public.kc_kept_count(r.id, k.season + 1) > k.keepers');
  execute src;
  src := pg_get_functiondef('public.execute_desk(uuid)'::regprocedure);
  src := replace(src, 'if n > 33 then', 'if n > coalesce(k.list_size, 33) then');
  src := replace(src, 'n, n - 33;', 'n, n - coalesce(k.list_size, 33);');
  execute src;
end $$;
