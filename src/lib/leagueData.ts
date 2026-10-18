import "server-only";
// Assembles the League page: THE POOL's sheet + this app's own week data (for games graded / remaining).
import { LEAGUE_GID, parseChamp, parseElim, parseMoney, rankBy, seedFrom, simulate, weeklyField, type Champ } from "./league";
import { labelOf, type Season } from "./scoring";
import { GAMES_PER_WEEK, parseCsv, parseSummaryTab, publicSheet, type Grid } from "./sheet";

export const LEAGUE_SHEET = process.env.LEAGUE_SHEET_ID || "1QbdsvKq1tZhZyOzAxkoLahVhvrp4sgyrKJ3fwXA_97k";
export const OUR_ENTRY = process.env.LEAGUE_ENTRY || "BAKE";

async function tab(gid: string): Promise<Grid> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${LEAGUE_SHEET}/export?format=csv&gid=${gid}`, { next: { revalidate: 600 } } as RequestInit);
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("csv")) throw new Error(`League sheet tab ${gid}: ${res.status}`);
  return parseCsv(await res.text());
}

/** THE POOL labels its periods "1".."18","B","CFP","P"; the BAKE sheet says "Week 1", "Bowl", "CFP", "Playoffs". */
const toBakeLabel = (p: string) => (/^\d+$/.test(p) ? `Week ${p}` : p === "B" ? "Bowl" : p === "P" ? "Playoffs" : p);
export const periodName = (p: string) => (/^\d+$/.test(p) ? `Week ${p}` : p === "B" ? "Bowl" : p === "P" ? "Playoffs" : p);

/** Games per period from the BAKE sheet's Summary tab (same slate as THE POOL). */
async function gamesPerPeriod(): Promise<Map<string, number>> {
  try {
    const id = process.env.SHEET_ID;
    if (!id) return new Map();
    const { periods } = parseSummaryTab(await publicSheet(id)("Summary"));
    return new Map(periods.map((p) => [p.label, p.games]));
  } catch { return new Map(); }
}

let cache: { key: string; at: number; value: unknown } | null = null;

export async function leagueView(season: Season) {
  const [champG, moneyG, elimG, perGames] = await Promise.all([tab(LEAGUE_GID.champ), tab(LEAGUE_GID.money), tab(LEAGUE_GID.elim), gamesPerPeriod()]);
  const champ: Champ = parseChamp(champG);
  const money = parseMoney(moneyG);
  const elim = parseElim(elimG);

  // Graded so far: this app's results (the same games as THE POOL). Remaining: the rest of the season's slate.
  const gradedByLabel = new Map(season.weeks.map((w) => [labelOf(w), w.games.filter((g) => g.result).length]));
  const sizeOf = (p: string) => perGames.get(toBakeLabel(p)) ?? season.weeks.find((w) => labelOf(w) === toBakeLabel(p))?.games.length ?? GAMES_PER_WEEK;
  const totalGames = champ.periods.reduce((s, p) => s + sizeOf(p), 0);
  const gradedGames = champ.periods.reduce((s, p) => s + (gradedByLabel.get(toBakeLabel(p)) ?? 0), 0);
  const remainingGames = Math.max(0, totalGames - gradedGames);

  const played = champ.periods.filter((p) => champ.rows.some((r) => (r.weekly[p] ?? 0) > 0));
  const current = played.at(-1) ?? null;
  const previous = played.at(-2) ?? null;
  const entries = champ.rows.map((r) => ({ entry: r.entry, wins: r.total }));

  const key = JSON.stringify([entries, gradedGames, remainingGames, champ.places]);
  let sim = cache && cache.key === key && Date.now() - cache.at < 600_000 ? (cache.value as ReturnType<typeof simulate>) : null;
  if (!sim) {
    sim = simulate({ entries, gradedGames, remainingGames, places: champ.places, sims: 5000, seed: seedFrom(entries) });
    cache = { key, at: Date.now(), value: sim };
  }
  const simBy = new Map(sim.map((s) => [s.entry, s]));
  const ranks = rankBy(champ.rows, (r) => r.total);
  const moneyBy = new Map(money.map((m) => [m.entry, m]));
  const elimBy = new Map(elim.rows.map((e) => [e.entry, e]));

  const rows = champ.rows.map((r) => {
    const rk = ranks.get(r)!;
    const prevRank = previous ? r.rankByWeek[previous] : undefined;
    // Rank after the last completed week; movement compares the latest two.
    const lastRank = current ? r.rankByWeek[current] : undefined;
    return {
      entry: r.entry, total: r.total, rank: rk.rank, tied: rk.tied, weekly: r.weekly,
      move: prevRank !== undefined && lastRank !== undefined ? prevRank - lastRank : 0,
      won: moneyBy.get(r.entry)?.total ?? 0,
      elim: elimBy.get(r.entry) ? { alive: elimBy.get(r.entry)!.alive, losses: elimBy.get(r.entry)!.losses } : null,
      odds: simBy.get(r.entry)!,
    };
  }).sort((a, b) => a.rank - b.rank || a.entry.localeCompare(b.entry));

  const leaderTotal = rows[0]?.total ?? 0;
  const cutoffRank = champ.places.length;
  const cutoff = [...rows].sort((a, b) => b.total - a.total)[cutoffRank - 1]?.total ?? 0;

  // Cumulative wins by period for us, the leader at each point, and the last paying place.
  const race = played.map((p, i) => {
    const upto = played.slice(0, i + 1);
    const cum = champ.rows.map((r) => upto.reduce((s, q) => s + (r.weekly[q] ?? 0), 0)).sort((a, b) => b - a);
    const ours = champ.rows.find((r) => r.entry === OUR_ENTRY);
    return { period: p, us: ours ? upto.reduce((s, q) => s + (ours.weekly[q] ?? 0), 0) : 0, leader: cum[0], cutoff: cum[cutoffRank - 1] ?? 0 };
  });

  const weeks = played.map((p) => {
    const f = weeklyField(champ, p)!;
    const wr = rankBy(champ.rows.filter((r) => r.weekly[p] !== undefined), (r) => r.weekly[p]);
    const ours = champ.rows.find((r) => r.entry === OUR_ENTRY);
    const ourRank = ours ? wr.get(ours) : undefined;
    return {
      period: p, label: periodName(p), field: f, us: ours?.weekly[p] ?? null,
      rank: ourRank?.rank ?? null, tied: ourRank?.tied ?? false, games: sizeOf(p),
      complete: (gradedByLabel.get(toBakeLabel(p)) ?? 0) >= sizeOf(p),
      won: moneyBy.get(OUR_ENTRY)?.byWeek[p] ?? 0,
    };
  });

  return {
    entry: OUR_ENTRY, entries: rows.length, updatedAt: new Date().toISOString(),
    champ: { pot: champ.pot, places: champ.places, leaderTotal, cutoff },
    games: { graded: gradedGames, remaining: remainingGames, total: totalGames },
    current, rows, race, weeks,
    money: money.filter((m) => m.total > 0).sort((a, b) => b.total - a.total).map((m) => ({ entry: m.entry, total: m.total, champ: m.champ, elim: m.elim })),
    elim: { alive: elim.alive, noLoss: elim.noLoss, oneLoss: elim.oneLoss, eliminated: elim.eliminated, pot: elim.pot, places: elim.places, entries: elim.rows.length,
      us: elimBy.get(OUR_ENTRY) ?? null },
  };
}

export type LeagueView = Awaited<ReturnType<typeof leagueView>>;
