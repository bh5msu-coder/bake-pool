# BAKE Pool

A phone-first web app for the BAKE pick'em pool (Brad, Andrew, Kevin, Eric). It replaces the shared Google Sheet
for making picks, building the group entry, grading results, standings, money and the eliminator. It still reads
the weekly lines from John's sheet.

- **Week**: tap a team to pick it. See who's on each side, the group entry, the deadline countdown, and copy the 30-line entry.
- **Pool**: season standings, money, a week-by-week grid, and per-player breakdowns (dogs/favourites, NFL/college, spread size, 2-2 splits, solo picks, head to head).
- **Elim**: vote on a team to lose outright. Used teams are blocked, and lives are tracked.
- **Explore**: filter all games by week, league, spread, side, split and picker.

## Pool rules the app applies

- **Majority** = 3 or more of the 4 humans on one side.
- **Entry pick** = Brad's override if set, else the majority, else Claude's pick (this breaks 2-2 ties).
- **Grading** is against the spread. The admin records which team covered (or a push).
- **Eliminator** = the group's vote (most votes; a tie needs Brad to pick). If that team wins, the group loses a life. Teams can't be reused.
  The group starts with 1 life and can buy another for $100 (one buy-back so far; Brad adjusts it on the Elim tab).
- **Money**: the season entry ($1,250, paid up front, as on the sheet's Summary tab) + eliminator buy-backs + any
  "other money" entries, minus winnings, split four ways.
- **Weeks** follow the sheet's season: 1–15, Bowl, 16–18, CFP, Playoffs. Each period's game count comes from the Summary tab.

## Stack

| Piece | What |
|---|---|
| App | Next.js 15 (React 19, TypeScript), installable to the home screen (web manifest) |
| Data + login | Supabase: Postgres with row-level security, email magic-link sign-in |
| Lines | Server route reads the sheet's **Converter** tab (CSV export link, tab found by name); Vercel Cron runs it daily |
| Hosting | Vercel |
| Tests | Vitest (scoring, sheet parsing, deadlines) |

## Run it locally

```bash
cd app
npm install
npm run dev          # http://localhost:3000
npm test             # 174 tests
```

To browse the UI without signing in, open **http://localhost:3000/?demo**. It uses a bundled copy of weeks 1–6
from the sheet, with Week 6 reopened so you can try picking. Demo mode is off in production builds.

## Environment variables (`app/.env.local`, and the same in Vercel)

| Name | Where to get it | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → publishable key | no |
| `SUPABASE_SECRET_KEY` | Supabase → API Keys → secret key | **yes**, server only |
| `SHEET_ID` | the long ID in the sheet's URL | no |
| `CRON_SECRET` | any long random string (`openssl rand -hex 32`) | **yes** |

The Supabase project is **bake-pool** (`ivucfpduvaiyxjcqbsqa`, us-east-2). The schema is in `supabase/migrations/` and is already applied.

## One-time setup

1. **Share the sheet** "Anyone with the link → Viewer". Without this, lines and history can't be read.
2. **Paste the secret key** into `app/.env.local` as `SUPABASE_SECRET_KEY`.
3. **Sign-in emails.** Done: Brad (admin), Andrew, Kevin and Eric are set. Change them from the app menu
   (tap your initial, top right).
4. **Email delivery.** Supabase's built-in email only sends to members of your Supabase org and is heavily rate-limited.
   Before Andrew, Kevin and Eric can sign in, set up custom SMTP: Supabase → Authentication → Emails → SMTP.
   [Resend](https://resend.com) has a free tier that works.
5. **Redirect URL.** Supabase → Authentication → URL Configuration: set Site URL to your Vercel URL and add
   `https://<your-app>.vercel.app/auth/callback` and `http://localhost:3000/auth/callback` to Redirect URLs.
6. **Import history.** Done for Weeks 1–6 (re-run any time from the menu or `npm run sheet -- import`; it overwrites
   those weeks from the sheet). Eliminator outcomes for Weeks 1–5 are recorded.

## Weekly flow

1. John's lines go into the sheet's **Converter** tab as usual (row 1 away, row 2 home, row 3 favourite, row 4 spread,
   row 5 printed line, one game per column; the first 30 columns are the slate).
2. Once a day the cron (`/api/lines/sync`) checks that tab. A new slate becomes the next week, with a Thursday 12:00 PM CT
   deadline. Moved lines are updated as long as the game has no result. An open week is never replaced automatically.
   Brad can also tap **Refresh lines** in the menu to preview and apply right away.
3. Everyone picks until the deadline. Brad enters Claude's picks with the **AS** selector.
4. Copy the entry from the Week tab and submit it.
5. After the games, Brad taps **⋯** on each game to record who covered, and sets the week's winnings in the menu.

## Command-line jobs

```bash
npm run sheet -- import                       # copy weeks/picks/results from the sheet (needs link sharing)
npm run sheet -- lines                        # preview the lines sync
npm run sheet -- lines --apply                # apply it
npm run sheet -- import --csv path/to/csvs    # same, from CSV exports named Picks.csv, Summary.csv, …
```

## Deployment

- **Live:** https://bake-pool.vercel.app (Vercel project `bake-pool`, team bh5msu-coder's projects)
- **Code:** https://github.com/bh5msu-coder/bake-pool (private). Pushing to `main` deploys automatically, as long as
  the commit's author email is one Vercel knows (your GitHub email); otherwise the deploy shows "Blocked".
- **Env vars in Vercel:** the Supabase URL and publishable key, `SHEET_ID` and `CRON_SECRET` are set.
  `SUPABASE_SECRET_KEY` must be added by hand (Settings → Environment Variables, Production, Sensitive), then redeploy.
  Until it's there, sign-in, lines sync and import all refuse to run.
- **Supabase auth URLs:** Authentication → URL Configuration → Site URL `https://bake-pool.vercel.app`;
  Redirect URLs `https://bake-pool.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`.
- **Cron:** `vercel.json` runs `/api/lines/sync` daily at 13:00 UTC (8 AM CT).

## Project layout

```
app/
  src/app/                 pages, layout, manifest, API routes (login, lines sync, history import, auth callback)
  src/components/          Week, Pool, Elim, Explore tabs; Menu (admin tools); shared UI and state
  src/lib/scoring.ts       all pool math (pure, tested)
  src/lib/sheet.ts         Google Sheet CSV parsing (tested)
  src/lib/sync.ts          lines sync + history import (server only)
  src/lib/data.ts          Supabase reads/writes
  supabase/migrations/     database schema and security rules
```
