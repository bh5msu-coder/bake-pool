// Loads the season from Supabase into the shape the scoring code uses, and
// wraps the writes the app makes. Row level security decides what's allowed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRACE_MINUTES } from "./deadline";
import type { Game, LedgerEntry, Player, Season, Week } from "./scoring";

type Row = Record<string, unknown>;

async function all(sb: SupabaseClient, table: string, order: string) {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").order(order).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function loadSeason(sb: SupabaseClient): Promise<Season> {
  const [players, settings, weeks, games, picks, elimPicks, elimWeeks, locks] = await Promise.all([
    all(sb, "players", "sort"), all(sb, "settings", "key"), all(sb, "weeks", "week"), all(sb, "games", "num"),
    all(sb, "picks", "game_id"), all(sb, "elim_picks", "week_id"), all(sb, "elim_weeks", "week_id"),
    all(sb, "pick_locks", "week_id"),
  ]);
  // Open weeks hide other people's picks; ask for how many each person has made instead.
  const now = Date.now();
  const openIds = weeks.filter((w) => !w.deadline || Date.parse(w.deadline as string) > now).map((w) => w.id as number);
  const counts = new Map<number, Record<string, number>>();
  const voters = new Map<number, string[]>();
  await Promise.all(openIds.map(async (id) => {
    const [{ data }, { data: v }] = await Promise.all([sb.rpc("pick_counts", { w: id }), sb.rpc("elim_voters", { w: id })]);
    counts.set(id, Object.fromEntries(((data ?? []) as { player_id: string; picked: number }[]).map((r) => [r.player_id, r.picked])));
    voters.set(id, (v ?? []) as string[]);
  }));
  const setting = (k: string) => settings.find((s) => s.key === k)?.value;
  const season = Number(setting("season") ?? new Date().getFullYear());

  const gameById = new Map<number, Game>();
  const gamesByWeek = new Map<number, Game[]>();
  for (const g of games) {
    const game: Game = {
      id: g.id as number, num: g.num as number, league: g.league as Game["league"],
      away: g.away as string, home: g.home as string, fav: g.fav as string, spread: Number(g.spread),
      line: g.line as string, result: (g.result as string) ?? null, entryOverride: (g.entry_override as string) ?? null, picks: {},
    };
    gameById.set(game.id!, game);
    const list = gamesByWeek.get(g.week_id as number) ?? [];
    list.push(game);
    gamesByWeek.set(g.week_id as number, list);
  }
  for (const p of picks) {
    const g = gameById.get(p.game_id as number);
    if (g) g.picks[p.player_id as string] = p.team as string;
  }

  return {
    season,
    elimBuybacks: Number(setting("elim_buybacks") ?? 0),
    elimBuybackCost: Number(setting("elim_buyback_cost") ?? 100),
    seasonFee: Number(setting("season_fee") ?? 0),
    graceMinutes: Number(setting("grace_minutes") ?? GRACE_MINUTES),
    ledger: Array.isArray(setting("ledger")) ? (setting("ledger") as LedgerEntry[]) : [],
    players: players.map((p): Player => ({
      id: p.id as string, name: p.name as string, initial: p.initial as string,
      kind: p.kind as Player["kind"], isAdmin: !!p.is_admin,
    })),
    upcoming: weeks.filter((w) => w.season === season && !gamesByWeek.has(w.id as number)).map((w) => ({
      id: w.id as number, week: w.week as number, label: (w.label as string) ?? `Week ${w.week}`, deadline: (w.deadline as string) ?? null,
    })),
    weeks: weeks.filter((w) => w.season === season && gamesByWeek.has(w.id as number)).map((w): Week => {
      const ew = elimWeeks.find((e) => e.week_id === w.id);
      return {
        id: w.id as number, week: w.week as number, label: (w.label as string) ?? null, deadline: (w.deadline as string) ?? null,
        entryFee: Number(w.entry_fee), winnings: Number(w.winnings),
        games: (gamesByWeek.get(w.id as number) ?? []).sort((a, b) => a.num - b.num),
        elim: {
          picks: Object.fromEntries(elimPicks.filter((e) => e.week_id === w.id).map((e) => [e.player_id, e.team])),
          override: (ew?.override_team as string) ?? null,
          outcome: (ew?.outcome as "survived" | "died") ?? null,
          voters: voters.get(w.id as number),
        },
        locks: locks.filter((l) => l.week_id === w.id).map((l) => l.player_id as string),
        counts: counts.get(w.id as number),
      };
    }),
  };
}

/** One game of the group entry, as Brad's early preview returns it. */
export interface EntryRow { num: number; entry: string; how: "majority" | "claude" }

/**
 * Brad's preview of the group entry once picks are due and Claude is in, before the lock reveals everyone's picks.
 * The database returns nothing to anyone else, or before then.
 */
/** One change to a pick. `changedBy` is null when the server made it (sheet sync, Claude's routine). */
export interface HistoryRow { player: string; from: string | null; to: string | null; changedBy: string | null; at: string }

/** A game's pick history. You see your own; everyone's once the week is revealed. */
export async function pickHistory(sb: SupabaseClient, gameId: number): Promise<HistoryRow[]> {
  const { data, error } = await sb.from("pick_history").select("player_id,old_team,new_team,changed_by,changed_at")
    .eq("game_id", gameId).order("changed_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ player: r.player_id, from: r.old_team, to: r.new_team, changedBy: r.changed_by, at: r.changed_at }));
}

/** The group's eliminator team for Brad's early preview (null on a tied vote, or before picks are due). */
export async function previewElim(sb: SupabaseClient, weekId: number): Promise<string | null> {
  const { data, error } = await sb.rpc("admin_elim", { w: weekId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function previewEntry(sb: SupabaseClient, weekId: number): Promise<EntryRow[]> {
  const { data, error } = await sb.rpc("admin_entry", { w: weekId });
  if (error) throw new Error(error.message);
  return (data ?? []) as EntryRow[];
}

/** Writes the app makes. `null` team clears a pick. */
export interface Mutations {
  setPick(gameId: number, playerId: string, team: string | null): Promise<void>;
  setLock(weekId: number, playerId: string, locked: boolean): Promise<void>;
  setElimPick(weekId: number, playerId: string, team: string | null): Promise<void>;
  setResult(gameId: number, result: string | null): Promise<void>;
  updateWeek(weekId: number, patch: { deadline?: string | null; entry_fee?: number; winnings?: number }): Promise<void>;
  setElimWeek(weekId: number, patch: { override_team?: string | null; outcome?: string | null }): Promise<void>;
  setPlayerEmail(playerId: string, email: string | null): Promise<void>;
  setSetting(key: "elim_buybacks" | "elim_buyback_cost" | "ledger" | "season_fee" | "grace_minutes", value: unknown): Promise<void>;
}

const check = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(friendly(error.message));
};
const friendly = (m: string) =>
  /row-level security|violates row/i.test(m) ? "That's locked: your picks are locked, the deadline passed, or the result is in." : m;

export function supabaseMutations(sb: SupabaseClient): Mutations {
  return {
    async setPick(game_id, player_id, team) {
      check(team
        ? await sb.from("picks").upsert({ game_id, player_id, team })
        : await sb.from("picks").delete().match({ game_id, player_id }));
    },
    async setLock(week_id, player_id, locked) {
      check(locked
        ? await sb.from("pick_locks").upsert({ week_id, player_id })
        : await sb.from("pick_locks").delete().match({ week_id, player_id }));
    },
    async setElimPick(week_id, player_id, team) {
      check(team
        ? await sb.from("elim_picks").upsert({ week_id, player_id, team, updated_at: new Date().toISOString() })
        : await sb.from("elim_picks").delete().match({ week_id, player_id }));
    },
    async setResult(id, result) { check(await sb.from("games").update({ result }).eq("id", id)); },
    async updateWeek(id, patch) { check(await sb.from("weeks").update(patch).eq("id", id)); },
    async setElimWeek(week_id, patch) { check(await sb.from("elim_weeks").upsert({ week_id, ...patch })); },
    async setSetting(key, value) { check(await sb.from("settings").upsert({ key, value })); },
    async setPlayerEmail(id, email) { check(await sb.from("players").update({ email: email?.trim().toLowerCase() || null }).eq("id", id)); },
  };
}
