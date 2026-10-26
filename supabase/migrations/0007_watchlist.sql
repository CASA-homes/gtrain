-- Personal watchlist: each signed-in coach's starred players. Private: only the owner can read or change their rows.
create table if not exists watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id bigint not null,           -- players.id, or a free agent's id (10,000,000+)
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);
alter table watchlist enable row level security;
create policy "watchlist: own rows" on watchlist for select using (user_id = auth.uid());
create policy "watchlist: add own" on watchlist for insert with check (user_id = auth.uid());
create policy "watchlist: remove own" on watchlist for delete using (user_id = auth.uid());
