-- Mock draft corrections, per coach: "retired / delisted" (out) and rating nudges (adj, +/-12 per click).
-- Private to each coach. Read by the commish's tooling to retune the simulator.
create table if not exists mock_edits (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_key text not null check (length(player_key) between 3 and 80),   -- p:<player id> or r:<draftee name>
  is_out boolean not null default false,
  adj int not null default 0 check (adj between -120 and 120),
  updated_at timestamptz not null default now(),
  primary key (user_id, player_key)
);
alter table mock_edits enable row level security;
create policy "mock_edits: read own" on mock_edits for select using (user_id = auth.uid());
create policy "mock_edits: add own" on mock_edits for insert with check (user_id = auth.uid());
create policy "mock_edits: change own" on mock_edits for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mock_edits: remove own" on mock_edits for delete using (user_id = auth.uid());
