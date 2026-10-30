-- One-match duel: two clubs snake-draft 5 players each from a single match (at least 2 from each side; the app checks that).
-- Positions don't matter in a duel, so the slot limits only apply to the 11-a-side draft, and a duel is full at 5 a club.
alter table mini_games drop constraint if exists mini_games_kind_check;
alter table mini_games add constraint mini_games_kind_check check (kind in ('snake11', 'cap5', 'duel5'));

create or replace function public.mini_pick_check() returns trigger language plpgsql security definer set search_path = public as $$
declare g mini_games; n int; cnt int; r int; i int; expected int; used int; lim int; per int;
begin
  select * into g from mini_games where id = new.game_id for update;
  if g is null or g.status <> 'drafting' then raise exception 'The draft is closed'; end if;
  per := case when g.kind = 'duel5' then 5 else 11 end;
  select count(*) into cnt from mini_picks where game_id = new.game_id;
  n := array_length(g.draft_order, 1);
  if cnt >= n * per then raise exception 'The draft is full'; end if;
  if new.pick_no <> cnt then raise exception 'Someone else just picked. Try again.'; end if;
  r := cnt / n; i := cnt % n;
  expected := case when r % 2 = 0 then g.draft_order[i + 1] else g.draft_order[n - i] end;
  if new.team_id <> expected then raise exception 'It is not this club''s turn'; end if;
  if g.kind <> 'duel5' then
    lim := case new.slot when 'DEF' then 3 when 'MID' then 4 when 'RUC' then 1 else 3 end;
    select count(*) into used from mini_picks where game_id = new.game_id and team_id = new.team_id and slot = new.slot;
    if used >= lim then raise exception 'No % spot left', new.slot; end if;
  end if;
  return new;
end $$;

create or replace function public.mini_pick_after() returns trigger language plpgsql security definer set search_path = public as $$
declare n int; cnt int; per int;
begin
  if tg_op = 'INSERT' then
    select array_length(draft_order, 1), case when kind = 'duel5' then 5 else 11 end into n, per from mini_games where id = new.game_id;
    select count(*) into cnt from mini_picks where game_id = new.game_id;
    if cnt >= n * per then update mini_games set status = 'done', finished_at = now() where id = new.game_id; end if;
  else
    update mini_games set status = 'drafting', finished_at = null where id = old.game_id and status = 'done';
  end if;
  return null;
end $$;
