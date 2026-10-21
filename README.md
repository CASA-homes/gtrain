# G-Train Fantasy Keeper

Private site for the G-Train AFL Fantasy keeper league: clubhouses, squads, player ratings, the trade market and league history. Coaches sign in with an emailed magic link; only invited emails get in.

Built with Next.js 15 and Supabase (database, logins, live chat), hosted on Vercel.

## One-time setup

### 1. Supabase database
1. Open the project → **SQL Editor** → New query.
2. Paste all of `supabase/migrations/0001_init.sql` and run it.
3. Paste all of `supabase/seed.sql` and run it. This loads the 10 teams, 319 players with 2026 stats, the 2026 ladder, the honour roll and Bodega Boys' picks.
4. Open `supabase/invites.sql`, replace the example emails with each coach's real email, set `is_commish` for the commissioner, and run it.

### 2. Supabase login settings
- **Authentication → URL Configuration**
  - Site URL: your Vercel address, e.g. `https://gtrain.vercel.app`
  - Redirect URLs: add `https://gtrain.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
- **Authentication → Sign In / Providers → Email**: leave Email on. Magic links are on by default.
- Supabase's built-in email only sends a handful of emails an hour. Before inviting all 10 coaches, add your own SMTP sender under **Authentication → Emails → SMTP Settings** (Resend's free plan works well).

### 3. Vercel
1. **Add New → Project → Import** the `gtrain` GitHub repo.
2. Under **Environment Variables** add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://lodkrficvsrdxgeajcdq.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase → Project Settings → API → `anon` `public` key
3. Deploy. Every push to `main` redeploys.

## Local development
```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev
```

## Data
- `data/squads-2026.txt` and `data/league.json` were scraped from keeperfantasy.com (league 288126) on 21 Oct 2026.
- `npm run seed` regenerates `supabase/seed.sql` from those files.
- Not on Keeper, so filled later by the stats feed: AFL club, full names, birth dates and draft picks (for potential and the age profile), and box-score stats (disposals, tackles and so on).

## League rules built in
From the league charter: 33-player squads, 17 keepers plus one rookie keeper (10 games or fewer), commissioner approval on every trade, and a 6-vote veto for lopsided trades.

## How the numbers work (`lib/ratings.ts`)
- **Value (0–100):** 70% average percentile against the same position, 15% durability (games of 23), 15% consistency (last-5 scores within 15% of average). Stars = value ÷ 20.
- **1–20 ratings:** percentile against every rostered player on the same line.
- **Best 22:** 5 DEF, 7 MID, 1 RUC, 5 FWD and 4 bench, picked on 2026 average.
- **Power rank:** Best 18 total. 1–2 strong contender, 3–4 top-4 contender, 5–7 mid-table, 8–10 rebuilding.
- **Pick points:** pick 1 = 3,000, falling about 7% per pick. A player's value converts to the same scale for fairness reads on offers.
