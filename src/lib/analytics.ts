// Season analytics behind the Pool dashboard. Pure functions over a Season.
import {
  band, BANDS, elimSummary, ENTRY, fmtPct, fmtRec, grade, humans, labelOf, MAJORITY, pct, pickOf, record, shortLabel, side, soloPicker, split,
  type Game, type Rec, type Season,
} from "./scoring";

export interface Picker { id: string; name: string }

/** Everyone who gets a line on the charts: players, then the group entry. */
export const pickers = (s: Season): Picker[] => [...s.players.map((p) => ({ id: p.id, name: p.name })), { id: ENTRY, name: "Submitted" }];

const graded = (s: Season) => s.weeks.filter((w) => w.games.some((g) => g.result));

/** Running "games over .500" after each graded week, starting from 0. */
export function trajectory(s: Season) {
  const ids = humans(s.players).map((p) => p.id);
  const weeks = graded(s);
  const labels = ["Start", ...weeks.map(shortLabel)];
  const series = pickers(s).map((p) => {
    let net = 0;
    const values = [0, ...weeks.map((w) => { const r = record(w.games, p.id, ids); net += r.w - r.l; return net; })];
    return { ...p, values };
  });
  return { labels, series };
}

/** Win % per picker per graded week (null where nothing was graded). */
export function weeklyGrid(s: Season) {
  const ids = humans(s.players).map((p) => p.id);
  const weeks = graded(s);
  return {
    cols: weeks.map(shortLabel),
    rows: pickers(s).map((p) => ({
      ...p,
      cells: weeks.map((w) => { const r = record(w.games, p.id, ids); return { rec: r, pct: pct(r) }; }),
    })),
  };
}

export const CATEGORIES: { key: string; label: string; test(g: Game, pick: string | null, ids: string[]): boolean }[] = [
  { key: "fav", label: "Favourites", test: (g, p) => side(g, p) === "Fav" },
  { key: "dog", label: "Underdogs", test: (g, p) => side(g, p) === "Dog" },
  { key: "nfl", label: "NFL", test: (g) => g.league === "NFL" },
  { key: "ncaa", label: "College", test: (g) => g.league === "NCAA" },
  ...BANDS.map((b) => ({ key: b, label: b === ">14" ? "14+ pts" : `${b} pts`, test: (g: Game) => band(g.spread) === b })),
  { key: "split", label: "2-2 splits", test: (g, _p, ids) => split(g, ids) === "2-2" },
];

/** Win % per picker in each category of game. */
export function categoryGrid(s: Season) {
  const ids = humans(s.players).map((p) => p.id);
  const games = s.weeks.flatMap((w) => w.games).filter((g) => g.result);
  return {
    cols: CATEGORIES.map((c) => c.label),
    rows: pickers(s).map((p) => ({
      ...p,
      cells: CATEGORIES.map((c) => {
        const r = record(games.filter((g) => c.test(g, pickOf(g, p.id, ids), ids)), p.id, ids);
        return { rec: r, pct: pct(r) };
      }),
    })),
  };
}

/** Row player's win % against the column player, counting only games where they picked differently. */
export function headToHeadGrid(s: Season) {
  const ids = humans(s.players).map((p) => p.id);
  const games = s.weeks.flatMap((w) => w.games).filter((g) => g.result);
  const ps = s.players.map((p) => ({ id: p.id, name: p.name }));
  return {
    cols: ps.map((p) => p.name),
    rows: ps.map((a) => ({
      ...a,
      cells: ps.map((b) => {
        if (a.id === b.id) return { rec: null as Rec | null, pct: null as number | null };
        const r: Rec = { w: 0, l: 0, p: 0 };
        for (const g of games) {
          const pa = pickOf(g, a.id, ids), pb = pickOf(g, b.id, ids);
          if (!pa || !pb || pa === pb) continue;
          const ga = grade(pa, g.result);
          if (ga === "W") r.w++; else if (ga === "L") r.l++; else r.p++;
        }
        return { rec: r, pct: pct(r) };
      }),
    })),
  };
}

/** How the group entry does by how strongly the four agreed. */
export function consensus(s: Season) {
  const ids = humans(s.players).map((p) => p.id);
  const games = s.weeks.flatMap((w) => w.games).filter((g) => g.result);
  return (["4-0", "3-1", "2-2"] as const).map((k) => {
    const r = record(games.filter((g) => split(g, ids) === k), ENTRY, ids);
    return {
      key: k, rec: r, pct: pct(r),
      label: k === "4-0" ? "All four agree" : k === "3-1" ? "Three of four" : "2-2 split (Claude decides)",
    };
  });
}

/** Each player's record when they were the lone dissenter in a 3-1. */
export function soloRecords(s: Season) {
  const ids = humans(s.players).map((p) => p.id);
  const games = s.weeks.flatMap((w) => w.games).filter((g) => g.result);
  return humans(s.players).map((p) => {
    const r = record(games.filter((g) => soloPicker(g, ids) === p.id), p.id, ids);
    return { id: p.id, name: p.name, rec: r, pct: pct(r) };
  });
}

export interface CompareCell { a: Rec; b: Rec; diff: number | null }
export interface CompareRow { id: string; name: string; cells: CompareCell[] }

/** Percentage points by which `who` beat `other` on these games (null if either has nothing decided). */
function versus(games: Game[], who: string, other: string, ids: string[]): CompareCell {
  const a = record(games, who, ids), b = record(games, other, ids);
  const pa = pct(a), pb = pct(b);
  return { a, b, diff: pa === null || pb === null ? null : Math.round((pa - pb) * 100) };
}

/**
 * One picker against others (players, the group entry and/or the majority), as win-% gaps in points.
 * By type of game: Overall, "When you differed" (only games where the two picked opposite sides), then each category.
 * By week: one row per graded week. Categories by side follow each picker's own pick, as elsewhere.
 */
export function compareGrid(s: Season, who: string, against: string[], by: "type" | "week"): { cols: string[]; rows: CompareRow[] } {
  const ids = humans(s.players).map((p) => p.id);
  const all = pickers(s).concat({ id: MAJORITY, name: "Humans" });
  const cols = against.map((id) => all.find((p) => p.id === id)?.name ?? id);
  const games = s.weeks.flatMap((w) => w.games).filter((g) => g.result);
  if (by === "week") {
    return {
      cols,
      rows: graded(s).map((w) => ({ id: `w${w.week}`, name: shortLabel(w), cells: against.map((o) => versus(w.games.filter((g) => g.result), who, o, ids)) })),
    };
  }
  const rows: CompareRow[] = [
    { id: "all", name: "Overall", cells: against.map((o) => versus(games, who, o, ids)) },
    {
      id: "differ", name: "When you differed", cells: against.map((o) => versus(games.filter((g) => {
        const a = pickOf(g, who, ids), b = pickOf(g, o, ids);
        return !!a && !!b && a !== b;
      }), who, o, ids)),
    },
    ...CATEGORIES.map((c) => ({
      id: c.key, name: c.label,
      cells: against.map((o) => {
        const a = record(games.filter((g) => c.test(g, pickOf(g, who, ids), ids)), who, ids);
        const b = record(games.filter((g) => c.test(g, pickOf(g, o, ids), ids)), o, ids);
        const pa = pct(a), pb = pct(b);
        return { a, b, diff: pa === null || pb === null ? null : Math.round((pa - pb) * 100) };
      }),
    })),
  ];
  return { cols, rows };
}

/** Everything for a finished week's recap card (and the text version to share). */
export function weekRecap(s: Season, weekNum: number) {
  const ids = humans(s.players).map((p) => p.id);
  const w = s.weeks.find((x) => x.week === weekNum)!;
  const games = w.games.filter((g) => g.result);
  const entry = record(games, ENTRY, ids);
  const people = s.players.map((p) => ({ id: p.id, name: p.name, rec: record(games, p.id, ids) }))
    .sort((a, b) => b.rec.w - a.rec.w || a.rec.l - b.rec.l);
  const best = people.filter((p) => p.rec.w === people[0].rec.w && p.rec.l === people[0].rec.l);
  const last = people.at(-1)!;
  const worst = people.filter((p) => p.rec.w === last.rec.w && p.rec.l === last.rec.l);
  const by = (k: "4-0" | "3-1" | "2-2") => record(games.filter((g) => split(g, ids) === k), ENTRY, ids);
  const elimRow = elimSummary(s).rows.find((r) => r.week === weekNum);
  const lives = elimSummary(s);
  const upTo = s.weeks.filter((x) => x.week <= weekNum).flatMap((x) => x.games).filter((g) => g.result);
  const season = record(upTo, ENTRY, ids);
  const label = labelOf(w);
  const text = [
    `BAKE Pool · ${label}: Entry ${fmtRec(entry)}${w.winnings ? ` · won $${w.winnings}` : ""}`,
    `Best: ${best.map((p) => p.name).join(", ")} (${fmtRec(best[0].rec)}) · Worst: ${worst.map((p) => p.name).join(", ")} (${fmtRec(worst[0].rec)})`,
    `All four agreed ${fmtRec(by("4-0"))} · 3-1 ${fmtRec(by("3-1"))} · Claude's tie-breaks ${fmtRec(by("2-2"))}`,
    elimRow?.team ? `Eliminator: ${elimRow.team} ${elimRow.outcome === "survived" ? "lost, we survived" : elimRow.outcome === "died" ? "won, life lost" : "pending"} · ${lives.livesLeft} ${lives.livesLeft === 1 ? "life" : "lives"} left` : "",
    `Season entry: ${fmtRec(season)} (${fmtPct(season)})`,
  ].filter(Boolean).join("\n");
  return { label, entry, winnings: w.winnings, people, best, worst, agree: by("4-0"), three: by("3-1"), ties: by("2-2"), elim: elimRow, livesLeft: lives.livesLeft, season, text };
}
