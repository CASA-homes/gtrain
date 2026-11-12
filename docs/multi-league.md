# Keeper HQ: multi-league plan

Goal: any commish can start (or import) a league on Keeper HQ. G-Train is league 1 and keeps working throughout.

## How league separation works
- `leagues` table; every league table has `league_id`.
- The app sends `x-league-id` (from the `khq_league` cookie, default 1) on every Supabase request.
- `current_league()` reads that header. `is_member()`, `is_commish()` and `my_team_id()` answer for the current league,
  so existing policies and RPCs became league-aware without rewrites.
- A restrictive `league scope` policy on every league table: a request only sees and writes its own league's rows.
- New tables in later migrations must add `league_id int not null default public.current_league() references leagues`
  plus the `league scope` policy (copy the loop body from 0027).

## Phases
1. **Foundation** (0027 + header in lib/supabase). Additive, no behaviour change. ← run 0024 then 0027
2. **Keys and server functions**: switch upserts to the `(league_id, …)` keys, drop the old season-only keys,
   add `and league_id = current_league()` inside every security-definer function (draft room, cup, challenges,
   desks, tokens, mini games) since those skip row security. Realtime chat filtered by league.
3. **League data out of files**: G-Train's honour roll, rules, results, lineups, draft history and keeper data still
   come from JSON in `data/` and `lib/`. Move them to tables (or gate them to league 1) so other leagues see their own.
4. **League switcher + invites**: `my_leagues()` in the header for people in several leagues; commish invites coaches
   (allowed_emails per league); `claim_invites()` on sign-in.
5. **Sign-up and create league**: open sign-up, `create_league()` RPC, the setup wizard (mockup approved), rules presets.
6. **Import**: spreadsheet import first; Keeper (keeperfantasy.com) import once access is sorted with Keeper.
7. **Launch**: own domain, terms and privacy page, Supabase paid plan (no pausing), usage limits.
