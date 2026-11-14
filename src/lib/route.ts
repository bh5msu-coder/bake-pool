// Screens as addresses: /week/10, /pool/compare, /elim/10, /league/board, /stats/games.
// "/" is this week's picks. Unknown paths fall back to it rather than erroring.

export type Tab = "week" | "pool" | "elim" | "league" | "stats";

/** Sub-views per tab; the first is the default and is left out of the address. */
export const SUBS: Record<Tab, readonly string[]> = {
  week: [],
  elim: [],
  pool: ["standings", "compare", "matchups", "breakdowns"],
  league: ["overview", "board", "money"],
  stats: ["overview", "splits", "teams", "fun", "games"],
};
const TABS = Object.keys(SUBS) as Tab[];

export interface Route { tab: Tab; sub?: string; week?: number }

export function parseRoute(pathname: string): Route {
  const [a, b] = pathname.split("/").filter(Boolean);
  if (a === "explore") return { tab: "stats", sub: "games" }; // the old Explore tab
  const tab = TABS.find((t) => t === a) ?? "week";
  if (tab === "week" || tab === "elim") {
    const n = Number(b);
    return Number.isInteger(n) && n > 0 ? { tab, week: n } : { tab };
  }
  return SUBS[tab].includes(b) ? { tab, sub: b } : { tab };
}

/** `week` is only written when it isn't the current week, so "/" always means "now". */
export function buildRoute(r: Route): string {
  if (r.tab === "week") return r.week ? `/week/${r.week}` : "/";
  if (r.tab === "elim") return r.week ? `/elim/${r.week}` : "/elim";
  return r.sub && r.sub !== SUBS[r.tab][0] ? `/${r.tab}/${r.sub}` : `/${r.tab}`;
}
