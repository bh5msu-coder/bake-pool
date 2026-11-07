import "server-only";
// Runs the two-way picks sync for the open week: reads the Picks tab, applies the plan to Supabase and the sheet,
// and remembers what was synced. Does nothing once the week has locked (the 2:35 write-back takes over).
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSeason } from "./data";
import { sheetsClient } from "./google";
import { planSync, syncKey, type SyncMode } from "./pickSync";
import { isOpen, labelOf } from "./scoring";
import { parseSummaryTab } from "./sheet";
import { planCalls } from "./sheetWrite";

export interface SyncResult { week: string | null; toApp: number; toSheet: number; skipped: string[]; message: string }

export async function syncOpenWeek(sb: SupabaseClient, sheetId: string, mode: SyncMode = "auto"): Promise<SyncResult> {
  const season = await loadSeason(sb);
  const week = season.weeks.find((w) => w.deadline && isOpen(w) && w.games.length > 0);
  if (!week?.id) return { week: null, toApp: 0, toSheet: 0, skipped: [], message: "No open week to sync." };

  const client = await sheetsClient(sheetId);
  const [summary, picksTab, { data: baseRows, error }, { data: lockRows }] = await Promise.all([
    client.read("Summary"), client.read("Picks"),
    sb.from("pick_sync").select("game_id,player_id,team").in("game_id", week.games.map((g) => g.id!)),
    sb.from("pick_locks").select("player_id").eq("week_id", week.id),
  ]);
  if (error) throw new Error(error.message);
  const period = parseSummaryTab(summary).periods.find((p) => p.label === labelOf(week));
  if (!period?.start) throw new Error(`The Summary tab has no row range for ${labelOf(week)}.`);

  const base = new Map((baseRows ?? []).map((r) => [syncKey(r.game_id, r.player_id), r.team as string | null]));
  const plan = planSync(picksTab, period, week, base, new Set((lockRows ?? []).map((r) => r.player_id)), mode);

  for (const c of plan.toApp) {
    const res = c.team
      ? await sb.from("picks").upsert({ game_id: c.gameId, player_id: c.player, team: c.team })
      : await sb.from("picks").delete().match({ game_id: c.gameId, player_id: c.player });
    if (res.error) throw new Error(res.error.message);
  }
  for (const c of planCalls(picksTab, period, week).calls) {
    const res = await sb.from("games").update({ entry_override: c.team, entry_override_by: null, entry_override_at: new Date().toISOString() }).eq("id", c.gameId);
    if (res.error) throw new Error(res.error.message);
  }
  await client.write(plan.toSheet);
  if (plan.base.length) {
    const res = await sb.from("pick_sync").upsert(plan.base.map((c) => ({ game_id: c.gameId, player_id: c.player, team: c.team, synced_at: new Date().toISOString() })));
    if (res.error) throw new Error(res.error.message);
  }
  const label = labelOf(week);
  return {
    week: label, toApp: plan.toApp.length, toSheet: plan.toSheet.length, skipped: plan.skipped,
    message: `${label}: ${plan.toApp.length} pick${plan.toApp.length === 1 ? "" : "s"} into the app, ${plan.toSheet.length} into the sheet.`
      + (plan.unmatched ? ` ${plan.unmatched} game${plan.unmatched === 1 ? "" : "s"} not found on the sheet.` : ""),
  };
}
