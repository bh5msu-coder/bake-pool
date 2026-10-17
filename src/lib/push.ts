import "server-only";
// Copies the app's picks (and eliminator votes and results) into the shared Google Sheet.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSeason } from "./data";
import { sheetsClient, type SheetsClient } from "./google";
import { labelOf, type Season, type Week } from "./scoring";
import { parseSummaryTab } from "./sheet";
import { planElim, planPicks } from "./sheetWrite";

export interface PushResult { week: string; cells: number; games: number; unmatched: string[]; filledGames: boolean }

async function pushOne(sb: SupabaseClient, client: SheetsClient, season: Season, week: Week): Promise<PushResult> {
  const [summary, picksTab, elimTab] = await Promise.all([client.read("Summary"), client.read("Picks"), client.read("Eliminator")]);
  const period = parseSummaryTab(summary).periods.find((p) => p.label === labelOf(week));
  if (!period?.start) throw new Error(`The Summary tab has no row range for ${labelOf(week)}.`);
  const picks = planPicks(picksTab, period, week);
  const cells = await client.write([...picks.writes, ...planElim(elimTab, season, week)]);
  if (week.id) await sb.from("weeks").update({ sheet_pushed_at: new Date().toISOString() }).eq("id", week.id);
  return { week: labelOf(week), cells, games: picks.rows, unmatched: picks.unmatched, filledGames: picks.filledGames };
}

/** Push one week now (admin button). */
export async function pushWeek(sb: SupabaseClient, sheetId: string, weekId: number) {
  const [season, client] = await Promise.all([loadSeason(sb), sheetsClient(sheetId)]);
  const week = season.weeks.find((w) => w.id === weekId);
  if (!week) throw new Error("That week doesn't exist.");
  return pushOne(sb, client, season, week);
}

/**
 * Scheduled run: push every week whose deadline passed in the last 9 days.
 * Safe to repeat: it rewrites the same values, plus any results entered since.
 */
export async function pushDue(sb: SupabaseClient, sheetId: string, now = Date.now()) {
  const season = await loadSeason(sb);
  const due = season.weeks.filter((w) => w.deadline && Date.parse(w.deadline) <= now && now - Date.parse(w.deadline) < 9 * 864e5);
  if (!due.length) return [];
  const client = await sheetsClient(sheetId);
  const out: PushResult[] = [];
  for (const w of due) out.push(await pushOne(sb, client, season, w));
  return out;
}
