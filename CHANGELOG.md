# Changelog


## 0.10.0 — 2026-10-22 · Picks sync both ways with the sheet
- Until the open week locks, picks sync **both ways** with the Picks tab every 10 minutes (Supabase timer →
  `/api/sheet/sync`).
  - Whichever side changed since the last sync wins, and the app wins if both did.
  - A pick typed in the sheet goes into the app; a pick made in the app goes into the sheet.
  - Locked players' picks always come from the app.
  - Names that aren't one of the game's two teams are skipped and reported.
  - `pick_sync` (migration 0012) remembers the last synced value per person and game.
- Menu buttons: **Import from sheet** (the sheet's picks win) and **Export to sheet** (the app's win), for right now.
- Only the open week's rows and the pick columns (G–J, L) are touched. Past and future weeks never are.
- Picks are written to the sheet as they're made, so anyone with the sheet link can see them before the lock (Brad's call).

## 0.9.4 — 2026-10-22 · Brad's early look at the weekly entry
- From noon Thursday (picks due), once Claude has a pick in every game, Brad gets **View weekly entry (admin)** in the
  picks card. It shows the group entry for every game, marks the ones Claude decided on a 2-2 split, and includes the
  eliminator team, with Copy. No need to wait for the 2:30 lock.
- The database works it out (`admin_entry`, migration 0011) and returns it only to the admin and only after the due time.
  It gives the entry only, so individual picks stay hidden until the lock or until everyone locks.

## 0.9.3 — 2026-10-22 · Sheet write stays inside its week
- The write-back refuses any cell outside the week's own rows on the Picks tab, and any blank value. Past and future
  weeks, and the "Picks / Brad Andrew Kevin Eric" headers, are never touched. Test added.
- Dry run for Week 7: 153 cells, all in rows 202–231 (plus Week 7's Eliminator row). 93 fill empty cells, 49 already
  match, and 11 replace the sheet's Claude picks with the app's.

## 0.9.2 — 2026-10-22 · Everyone owns their picks
- Only you can enter, change or lock your picks. Brad's "Picking as" now lists just Brad and Claude, and the database
  enforces the same rule (migration 0010).
- **Force entry is gone.** The group entry is the majority (3 of 4), and Claude's pick decides only 2-2 splits.
  It had never been used. A database check keeps `entry_override` empty.
- The eliminator's group-team override is unchanged.

## 0.9.1 — 2026-10-22 · The week moves forward on its own
- **Lines are checked every 30 minutes** (Supabase timer `lines-sync`, migration 0009, calling `/api/lines/sync?push=0`),
  not just once a day at 8 AM CT. The next week shows up in the app within half an hour of John posting its lines, with
  no need to tap Refresh lines. The daily Vercel run still does the sheet write-back safety net; `?push=0` skips it.
- **The app moves to the new week by itself.** When a refresh (coming back to the foreground, or the minute-by-minute
  check while picks are hidden) finds that a new week has opened, the Week, Elim and menu screens go to it. Browsing an
  older week isn't interrupted otherwise.
- Tests for which week the app lands on.
- Live scores: "Central Florida" on the sheet now matches ESPN's "UCF" (the one Week 7 game that wasn't auto-grading).

## 0.9.0 — 2026-10-20 · Rest of the season on the schedule
- Weeks 7–15, Bowl, Weeks 16–18, CFP and Playoffs are listed as **upcoming** (from the Summary tab), each with an
  estimated Thursday 2:30 PM CT lock; Bowl, CFP and Playoffs are "date TBD". They show in the week menu as
  "Lines not posted yet" and stay out of standings and stats until they have games.
- The lines sync now **fills the upcoming week** when John posts its slate, instead of always adding a new one. The
  lock is the Thursday after the lines post, unless Brad already set one for that week.
- `npm run sheet -- schedule [--apply]` lists or adds the remaining weeks.

## 0.8.1 — 2026-10-18 · Clearer game rows
- **✓ now means the group entry** (it replaces the black "E" box), shown before the team name once picks are revealed.
- **Your pick is the tinted row.** While everyone else's picks are hidden, it also carries a "Your pick" label; after
  the reveal your chip is ringed among the others.
- Pick chips overlap like an avatar stack and the left column is narrower, so team names keep more room on phones.
- The key above the games is always shown and lists only what's on screen.

## 0.8.0 — 2026-10-18 · Personal locks and hidden picks
- **Lock my picks**: once you've picked every game you can lock. Until then, and until you lock, you can change
  anything. You can unlock again while others are still picking.
- **Picks are hidden** from everyone else until all four have locked and Claude has a pick in every game, or the
  2:30 PM lock passes. Enforced by the database (migration 0008: `pick_locks`, `private.week_revealed`), not just
  the screen. Everyone sees how many games each person has picked and who has locked (`pick_counts`).
- When the last person locks, the **group entry is final**: picks are revealed and written to the sheet right away
  (`/api/sheet/lock-push`), without waiting for the deadline. Nobody can unlock after that.
- After each new pick the list **jumps to the next game you haven't picked**; after the last one it lands on the lock button.
- While picks are hidden, the app checks every minute for who has locked.
- Tested the database rules by acting as Andrew: own picks only, can't change after locking, can't lock for
  someone else, everything visible once the group locks.

## 0.7.2 — 2026-10-18 · Soft deadline with a grace period
- Picks are now **due Thursday at noon CT** (soft deadline) and **lock at 2:30 PM CT** (hard lock, unchanged).
  The 150 minutes between is a grace period: anyone can still pick, and the header turns amber with
  "Grace period · locks in …".
- The lock, the sheet write 5 minutes after it, and the database rules are unchanged; only what the app shows moved.
- Grace period is a setting (`grace_minutes`, migration 0007) Brad can change in the menu.
- Tests for the due/grace/locked phases.

## 0.7.1 — 2026-10-18 · Cleaner weekly picks
- Phones: the open week no longer repeats the deadline three times; the header carries it, and the progress card
  is a slim meter plus one line of everyone's pick counts.
- "Copy entry" is now Brad-only on the desktop rail (the sheet write at the deadline does the job); the rules
  paragraph is shorter and desktop-only.
- "To pick" is the default while you have blanks, and a game stays in the list after you pick it, so rows don't
  jump out from under your thumb. Shows "All picked" when done.
- Brad's "Picking as" selector moved into the progress card, freeing a row above the games.

## 0.7.0 — 2026-10-17 · The Pool league page
- New **League** tab: THE POOL (45 entries) from BAKE's point of view, read from the league's Google Sheet
  (Champ, Money and Elim tabs via CSV export, cached 10 minutes).
  - Overview: championship rank, wins behind the leader and behind 4th place (last paid spot), money won, elimination.
  - **Chance to finish in the money**: Monte Carlo of 5,000 seasons over the games left. Each entry's pick rate is
    drawn from a Beta posterior (its record blended with the field average, 300-game prior), the rest of the season
    is played out, ties split payouts. Shows odds of top 4 and of 1st, expected payout, projected final wins (10th–90th).
  - "Chasing the money" gap chart (vs leader, vs 4th place) and weekly finishes (field range, middle half, BAKE).
  - Leaderboard: all 45 entries, sortable, BAKE pinned, weekly wins, rank change, money and odds.
  - Money leaders and the elimination field.
- Games graded/remaining come from this app's weeks and the BAKE sheet's Summary tab (same slate as THE POOL).

## 0.6.0 — 2026-10-17 · sports-app redesign
- Dark scoreboard header and desktop sidebar; stronger contrast for small text; uppercase section labels.
- Week tab rebuilt as scoreboard rows: status column (live clock, Final, or kickoff time), one row per team with
  score and spread, a green edge on the team covering, ✓ on your pick, an "E" marker for the group entry.
- Games grouped into Live now → each upcoming day (kickoff order) → Final.
- Sticky summary line in the header: picks progress and countdown before the deadline; live Entry and your record after.
- Tap the week title for a week menu with each week's status and Entry record.
- Live data loads from six days before the deadline (kickoff times) and refreshes every minute only when a game
  is live or about to start, otherwise every 5 minutes.
- Pool split into Standings / Matchups / Breakdowns; heatmaps show whole percentages.

## 0.5.0 — 2026-10-17 · live scores
- Live scores from ESPN's public scoreboard: game cards show the score, clock (pulsing red while live), and which
  side is covering the spread right now; the locked-week summary shows a live Entry record.
  Refreshes every minute while the app is open during a week's games.
- Finished games are graded automatically every 10 minutes (Supabase timer → `/api/scores/sync`): final score
  vs the spread decides who covered. Never overwrites a result that was entered by hand. Any new results are
  then written to the Google Sheet.
- Team names are matched sheet → ESPN (NFL by abbreviation; college by school name with the sheet's "U" prefix
  and aliases like Pitt, UNC, Cal, Miami (FL)). All 30 Week 6 games match.

## 0.4.1 — 2026-10-17
- Removed "Import weeks from the sheet" (menu button, `/api/import-history` route and `npm run sheet -- import`).
  The app is now the source of truth and writes to the sheet; importing could have overwritten picks made in the app.

## 0.4.0 — 2026-10-16 · deadline + write-back
- Deadline is now **Thursday 2:30 PM Central** (follows the CDT/CST change). Past weeks keep their old noon deadline.
- Picks, eliminator votes, overrides and results are written into the Google Sheet 5 minutes after each deadline
  (Supabase timer), again by the daily job (catches results), or on demand from the menu. Matches rows by team names;
  fills an empty week block with games and lines; never blanks a cell or touches formula columns.
- Needs a Google service account with Editor access to the sheet (`GOOGLE_SERVICE_ACCOUNT_KEY`).

## 0.3.0 — 2026-10-16 · redesign + desktop analytics
**Design (mobile and desktop share one system)**
- New colour system: warm-neutral surfaces, ink text, one navy accent for "you / selected".
- Fixed colour per picker, used in every chip, legend, chart and table: Brad blue, Andrew orange, Kevin aqua,
  Eric yellow, Claude pink; the Entry is ink. Validated for colour-blind separation in light and dark
  (dataviz validator: all checks pass; three light colours sit under 3:1, so every chart has a legend,
  direct labels and a table view).
- One typeface (IBM Plex Sans) instead of three; tabular figures only where numbers line up; sentence-case labels.
- Mobile: game cards about 40% shorter (no team-colour stripes, spread inline), clearer countdown with a
  progress meter, icon tab bar.

**Desktop (1024px and wider)**
- Left sidebar with a running season summary; Week shows games in two columns beside a sticky status rail.
- Pool becomes a dashboard: stat tiles, standings, a "season race" line chart (games over .500 per week, with
  crosshair tooltip), heatmaps for week-by-week win %, head to head and win % by type of game (blue above .500,
  red below, grey at even), agreement and solo-pick bars, money and weekly records, and drill-down into Explore.
- Eliminator and Explore get two-column layouts; Explore's filters are always visible.
- Every chart has a Chart/Table toggle.

## 0.2.1 — 2026-10-16
- Sign-in emails set for Brad (admin), Andrew, Kevin and Eric.
- Confirmed: Week 2's 2-2 games were decided by Claude (Entry 16-14). The sheet's Summary shows 12-18 because its
  Week 2 Majority column was left blank on ties; the app is right.
- Money: the sheet's $1,250 is 21 × $59.52 season entries set before the season; the $100 eliminator re-entry was never
  added to it. The app counts both: net -$1,150, -$287.50 each (the sheet shows -$1,050).

## 0.2.0 — 2026-10-16 · real data
- Imported Weeks 1–6 from the live sheet: 180 games, 900 picks, 151 results, eliminator votes, $200 winnings.
  Every player's weekly record matches the Summary tab.
- Season periods follow the Summary tab: Weeks 1–15, Bowl, 16–18, CFP, Playoffs. Each has a label, and its
  game count comes from the sheet (e.g. Week 14 = 23 games, CFP = 11) instead of assuming 30.
- Money now matches the sheet's model: a $1,250 season entry paid up front (set in the menu), plus buy-backs, minus winnings.
- Sheet parser forgives small typos in team names (the sheet has "Virgina Tech").
- `npm run sheet -- import|lines [--csv dir] [--apply]` runs the import or lines sync from the terminal,
  from Google or from a folder of CSV exports.
- Tests now also run against a CSV export of the real sheet (179 tests).
- Recorded eliminator outcomes for Weeks 1–5 (survived ×4, life lost in Week 5).
- Sheet reader uses Google's CSV export link per tab (found by tab name). Google's "gviz" CSV reshuffled this sheet's
  header rows and returned empty weeks, so it is no longer used. Verified that the live sheet parses identically to the export.
- Tested against the live sheet: lines sync ("Week 6 already matches"), history import, cron route auth, admin-only route, login allow-list.

## 0.1.1 — 2026-10-16
- Eliminator: 1 life to start plus paid buy-backs ($100 each, 1 bought so far), replacing the guessed "2 lives".
  Buy-backs count toward money. Brad adjusts them on the Elim tab.
- "Other money" list in the admin menu for one-off costs or winnings.
- Money card now explains its total (weekly entries + buy-backs + other).
- The sheet's Lock column stays ignored, as confirmed.

## 0.1.0 — 2026-10-16 · first build

**Built**
- Next.js PWA with four tabs (Week, Pool, Elim, Explore) based on the original console artifact's design.
- Supabase schema (players, weeks, games, picks, eliminator, settings) with row-level security.
- Email magic-link sign-in, limited to emails on the pool list.
- Lines sync from the sheet's Converter tab (daily cron + admin Refresh button with preview).
- One-click history import from the Picks, Eliminator and Summary tabs.
- Admin tools: results, entry overrides, Claude's picks, eliminator outcome/override, deadline, fee, winnings, player emails.

**Quality improvements made automatically**
- Scoring logic checked against all 150 graded games from the sheet (majority, entry, splits, every season record).
- Security: picks can only be written by their owner before the deadline (enforced in the database, not just the UI); helper functions moved out of the public API; secret keys server-only.
- Upgraded Next.js 15.5.4 → 15.5.28 and pinned patched postcss/sharp (`npm audit` reports 0 issues).
- The sheet parser flags games where it can't tell the favourite, instead of guessing silently.
- A refused write rolls the screen back and shows why; the app refreshes when it returns to the foreground.
- Deadlines are computed in US Central time, including the November clock change.
- Empty states, loading states, keyboard/Escape support on sheets, labelled buttons for screen readers, dark mode.
- Demo data loads only in demo mode, keeping it out of the production bundle.

**Changed from the sheet / artifact**
- The "Copy entry" button shows how many picks are still missing instead of looking finished while Claude's picks fill the gaps.
