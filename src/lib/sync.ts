import "server-only";
// Server-side job that reads John's lines from the Google Sheet and writes them to Supabase with the secret key.
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextDeadline } from "./deadline";
import { GAMES_PER_WEEK, parseConverter, parseSummaryTab, type ParsedGame, type Period, type TabReader } from "./sheet";

const key = (g: { away: string; home: string }) => `${g.away}|${g.home}`;

async function currentSeason(sb: SupabaseClient) {
  const { data } = await sb.from("settings").select("value").eq("key", "season").maybeSingle();
  return Number(data?.value ?? new Date().getFullYear());
}

/** Season periods from the Summary tab; falls back to plain 30-game weeks if the tab can't be read. */
async function periods(read: TabReader): Promise<Period[]> {
  try { return parseSummaryTab(await read("Summary")).periods; } catch { return []; }
}
const periodAt = (ps: Period[], order: number): Period =>
  ps[order - 1] ?? { order, label: `Week ${order}`, games: GAMES_PER_WEEK, winnings: 0 };

export type LinesPlan =
  | { action: "none"; week: number; label: string; message: string; games: ParsedGame[] }
  | { action: "update"; week: number; label: string; weekId: number; message: string; games: ParsedGame[]; changes: { num: number; from: string; to: string }[] }
  | { action: "create"; week: number; label: string; deadline: string; message: string; games: ParsedGame[] }
  | { action: "conflict"; week: number; label: string; weekId: number; message: string; games: ParsedGame[] };

/** Compares the Converter tab with the latest week and decides what to do. Writes nothing. */
export async function planLinesSync(sb: SupabaseClient, read: TabReader, now = new Date()): Promise<LinesPlan> {
  const season = await currentSeason(sb);
  const [converter, ps, { data: latest }] = await Promise.all([
    read("Converter"), periods(read),
    sb.from("weeks").select("id,week,label,deadline").eq("season", season).order("week", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (latest) {
    const label = latest.label ?? `Week ${latest.week}`;
    const { data: existing } = await sb.from("games").select("id,num,away,home,fav,spread,line,result").eq("week_id", latest.id);
    const games = parseConverter(converter, existing?.length || periodAt(ps, latest.week).games);
    const have = new Map((existing ?? []).map((g) => [key(g), g]));
    const same = existing?.length === games.length && games.every((g) => have.has(key(g)));
    if (same) {
      const changes = games.flatMap((g) => {
        const old = have.get(key(g))!;
        return !old.result && (old.line !== g.line || Number(old.spread) !== g.spread || old.fav !== g.fav)
          ? [{ num: old.num as number, from: old.line as string, to: g.line }] : [];
      });
      return changes.length
        ? { action: "update", week: latest.week, label, weekId: latest.id, games, changes, message: `${changes.length} line${changes.length > 1 ? "s" : ""} moved for ${label}.` }
        : { action: "none", week: latest.week, label, games, message: `${label} already matches the sheet.` };
    }
    const open = !latest.deadline || now.getTime() < Date.parse(latest.deadline);
    if (open)
      return { action: "conflict", week: latest.week, label, weekId: latest.id, games, message: `The sheet has a different slate than ${label}, which is still open. Replacing it would erase its picks.` };
  }
  const p = periodAt(ps, (latest?.week ?? 0) + 1);
  const games = parseConverter(converter, p.games);
  if (games.length < 2) throw new Error("Couldn't find any games on the Converter tab.");
  return {
    action: "create", week: p.order, label: p.label, deadline: nextDeadline(now).toISOString(), games,
    message: `New slate found: ${p.label}, ${games.length} games${games.length < p.games ? ` (the Summary tab expects ${p.games})` : ""}.`,
  };
}

export async function applyLinesSync(sb: SupabaseClient, plan: LinesPlan, opts: { replace?: boolean } = {}) {
  const now = new Date().toISOString();
  if (plan.games.some((g) => g.problem)) throw new Error("Fix the flagged games on the sheet first.");
  const rows = (weekId: number) => plan.games.map(({ problem: _p, entryOverride: _o, ...g }) => ({ ...g, week_id: weekId }));

  if (plan.action === "update") {
    for (const g of plan.games) {
      const { error } = await sb.from("games").update({ fav: g.fav, spread: g.spread, line: g.line })
        .eq("week_id", plan.weekId).eq("away", g.away).eq("home", g.home).is("result", null);
      if (error) throw new Error(error.message);
    }
    await sb.from("weeks").update({ lines_synced_at: now }).eq("id", plan.weekId);
  } else if (plan.action === "create") {
    const season = await currentSeason(sb);
    const { data: w, error } = await sb.from("weeks")
      .insert({ season, week: plan.week, label: plan.label, deadline: plan.deadline, lines_synced_at: now }).select("id").single();
    if (error) throw new Error(error.message);
    const ins = await sb.from("games").insert(rows(w.id));
    if (ins.error) throw new Error(ins.error.message);
  } else if (plan.action === "conflict" && opts.replace) {
    const del = await sb.from("games").delete().eq("week_id", plan.weekId);
    if (del.error) throw new Error(del.error.message);
    const ins = await sb.from("games").insert(rows(plan.weekId));
    if (ins.error) throw new Error(ins.error.message);
    await sb.from("weeks").update({ lines_synced_at: now }).eq("id", plan.weekId);
  }
}
