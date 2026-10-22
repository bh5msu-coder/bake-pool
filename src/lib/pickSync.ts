// Two-way sync of one open week's picks between the app and the Picks tab, until the lock.
// Pure: given both sides and what was last synced, decides what to change on each side.
//
// Rule ("latest change wins"): for each person and game we remember the value last synced.
// - Only the sheet changed since then → the app takes the sheet's pick (a cleared cell clears the app's pick).
// - Only the app changed → the sheet gets the app's pick.
// - Both changed, or first time with two different picks → the app wins.
// Locked players: the app always wins. Import and Export buttons force one direction.
import type { Week } from "./scoring";
import { matchTeam, type Grid, type Period } from "./sheet";
import { cell, COL, PICKERS, weekRows, type CellWrite } from "./sheetWrite";

export type SyncMode = "auto" | "import" | "export";
export interface PickChange { gameId: number; player: string; team: string | null }
export interface SyncPlan { toApp: PickChange[]; toSheet: CellWrite[]; base: PickChange[]; skipped: string[]; unmatched: number }

const COLIDX: Record<string, number> = { brad: 6, andrew: 7, kevin: 8, eric: 9, claude: 11 };
export const syncKey = (gameId: number, player: string) => `${gameId}:${player}`;

export function planSync(picksTab: Grid, period: Period, week: Week, base: Map<string, string | null>, locked: Set<string>, mode: SyncMode): SyncPlan {
  const plan: SyncPlan = { toApp: [], toSheet: [], base: [], skipped: [], unmatched: 0 };
  const { rows } = weekRows(picksTab, period, week);
  for (const g of week.games) {
    const row = rows.get(g.num);
    if (!row || !g.id) { plan.unmatched++; continue; }
    for (const p of PICKERS) {
      const app = g.picks[p] ?? null;
      const raw = cell(picksTab, row, COLIDX[p]);
      const sheet = raw ? matchTeam(raw, g.away, g.home) : null;
      if (raw && !sheet) { plan.skipped.push(`G${g.num} ${p}: "${raw}" isn't ${g.away} or ${g.home}`); continue; }
      const key = syncKey(g.id, p);
      let final: string | null;
      if (locked.has(p) || mode === "export") final = app ?? sheet;
      else if (mode === "import") final = sheet ?? app;
      else if (app === sheet) final = app;
      else if (!base.has(key)) final = app ?? sheet;
      else {
        const b = base.get(key) ?? null;
        final = sheet !== b && app === b ? sheet : (app ?? sheet);
      }
      if (final !== app) plan.toApp.push({ gameId: g.id, player: p, team: final });
      if (final && final !== raw) plan.toSheet.push({ range: `Picks!${COL[p]}${row}`, values: [[final]] });
      if (base.get(key) !== final || !base.has(key)) plan.base.push({ gameId: g.id, player: p, team: final });
    }
  }
  return plan;
}
