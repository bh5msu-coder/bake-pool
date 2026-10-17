# Changelog

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
