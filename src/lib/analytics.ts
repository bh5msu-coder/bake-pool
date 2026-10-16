// Season analytics behind the Pool dashboard. Pure functions over a Season.
import {
  band, BANDS, ENTRY, grade, humans, pct, pickOf, record, shortLabel, side, soloPicker, split,
  type Game, type Rec, type Season,
} from "./scoring";

export interface Picker { id: string; name: string }

/** Everyone who gets a line on the charts: players, then the group entry. */
export const pickers = (s: Season): Picker[] => [...s.players.map((p) => ({ id: p.id, name: p.name })), { id: ENTRY, name: "Entry" }];

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
