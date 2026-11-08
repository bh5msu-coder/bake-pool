// All-time stats behind the Stats tab: the 2024-25 and 2025-26 sheets (history.json) plus the live season.
// Pure functions over a flat list of graded games. Only human picks and the submitted entry; never Claude.
import { band, BANDS, ENTRY, entryPick, humans, labelOf, pct, type Rec, type Season } from "./scoring";

export interface SG {
  season: string; // "2024-25"
  week: string; // "Week 7", "Bowl", "CFP", "Playoffs"
  wi: number; // running week order across all seasons
  lg: "NFL" | "NCAA";
  away: string; home: string; fav: string; spread: number;
  result: string; // team that covered, or "PUSH"
  picks: Record<string, string>; // human ids and "entry"
}

export interface HistoryFile {
  seasons: { id: string; players: Record<string, string> }[];
  games: { s: string; w: string; lg: "NFL" | "NCAA"; a: string; h: string; f: string; sp: number; r: string; p: Record<string, string>; e?: string }[];
}

export const PEOPLE: { id: string; name: string }[] = [
  { id: "brad", name: "Brad" }, { id: "andrew", name: "Andrew" }, { id: "kevin", name: "Kevin" }, { id: "eric", name: "Eric" },
];
export const SUBMITTED = { id: ENTRY, name: "Submitted" };
/** At −110 you need 52.4% to break even. */
export const BREAKEVEN = 110 / 210;
/** Under 20 decisions a split is too thin to read much into. */
export const SMALL = 20;

export const seasonLabel = (year: number) => `${year}-${String((year + 1) % 100).padStart(2, "0")}`;

/** Flatten history.json and the live season into one ordered list of graded games. */
export function allGames(hist: HistoryFile, live?: Season | null): SG[] {
  const out: SG[] = [];
  let wi = -1, last = "";
  for (const g of hist.games) {
    const key = `${g.s}|${g.w}`;
    if (key !== last) { wi++; last = key; }
    const picks = { ...g.p };
    if (g.e) picks[ENTRY] = g.e;
    out.push({ season: g.s, week: normWeek(g.w), wi, lg: g.lg, away: g.a, home: g.h, fav: g.f, spread: g.sp, result: g.r, picks });
  }
  if (live) {
    const label = seasonLabel(live.season);
    if (!hist.seasons.some((s) => s.id === label)) {
      const ids = humans(live.players).map((p) => p.id);
      for (const w of [...live.weeks].sort((a, b) => a.week - b.week)) {
        const done = w.games.filter((g) => g.result);
        if (!done.length) continue;
        wi++;
        for (const g of [...done].sort((a, b) => a.num - b.num)) {
          const picks: Record<string, string> = {};
          for (const id of ids) if (g.picks[id]) picks[id] = g.picks[id];
          const e = entryPick(g, ids);
          if (e) picks[ENTRY] = e;
          out.push({ season: label, week: normWeek(labelOf(w)), wi, lg: g.league, away: g.away, home: g.home, fav: g.fav, spread: g.spread, result: g.result!, picks });
        }
      }
    }
  }
  return out;
}

function normWeek(w: string) {
  const t = w.trim();
  if (/^bowl/i.test(t)) return "Bowl";
  if (/^cfp/i.test(t)) return "CFP";
  if (/^playoff/i.test(t)) return "Playoffs";
  return t;
}

export const seasonsOf = (games: SG[]) => [...new Set(games.map((g) => g.season))];
export const isPost = (g: SG) => !/^Week /.test(g.week);

// ---------- records ----------
export type Pred = (g: SG, pick: string) => boolean;
const decided = (r: Rec) => r.w + r.l;

export function rec(games: SG[], who: string, pred?: Pred): Rec {
  const r: Rec = { w: 0, l: 0, p: 0 };
  for (const g of games) {
    const pick = g.picks[who];
    if (!pick || (pred && !pred(g, pick))) continue;
    if (g.result === "PUSH") r.p++;
    else if (pick === g.result) r.w++;
    else r.l++;
  }
  return r;
}

/** Profit on flat $100 bets at −110 (a win pays $90.91). */
export const profit = (r: Rec) => Math.round(r.w * (100 / 1.1) - r.l * 100);

export const isHome: Pred = (g, p) => p === g.home;
export const isFav: Pred = (g, p) => p === g.fav;

export const SPLITS: { key: string; label: string; test: Pred }[] = [
  { key: "home", label: "Home", test: isHome },
  { key: "road", label: "Road", test: (g, p) => !isHome(g, p) },
  { key: "fav", label: "Fav", test: isFav },
  { key: "dog", label: "Dog", test: (g, p) => !isFav(g, p) },
  { key: "hf", label: "Home fav", test: (g, p) => isHome(g, p) && isFav(g, p) },
  { key: "hd", label: "Home dog", test: (g, p) => isHome(g, p) && !isFav(g, p) },
  { key: "rf", label: "Road fav", test: (g, p) => !isHome(g, p) && isFav(g, p) },
  { key: "rd", label: "Road dog", test: (g, p) => !isHome(g, p) && !isFav(g, p) },
  { key: "nfl", label: "NFL", test: (g) => g.lg === "NFL" },
  { key: "cfb", label: "CFB", test: (g) => g.lg === "NCAA" },
  { key: "reg", label: "Reg. season", test: (g) => !isPost(g) },
  { key: "post", label: "Postseason", test: (g) => isPost(g) },
];

export const BAND_LABEL = (b: string) => (b === ">14" ? "14+" : b);
export const bandSplits = BANDS.map((b) => ({ key: b, label: BAND_LABEL(b), test: ((g: SG) => band(g.spread) === b) as Pred }));

export interface Cell { rec: Rec | null; pct: number | null }
const cell = (r: Rec): Cell => (decided(r) ? { rec: r, pct: pct(r) } : { rec: null, pct: null });

/** Rows of win % for each picker over a set of splits. */
export function grid(games: SG[], who: { id: string; name: string }[], splits: { label: string; test: Pred }[]) {
  return {
    cols: splits.map((s) => s.label),
    rows: who.map((p) => ({ ...p, cells: splits.map((s) => cell(rec(games, p.id, s.test))) })),
  };
}

/** Win % for each picker in each season. */
export function seasonGrid(games: SG[], who: { id: string; name: string }[]) {
  const seasons = seasonsOf(games);
  return {
    cols: seasons,
    rows: who.map((p) => ({ ...p, cells: seasons.map((s) => cell(rec(games.filter((g) => g.season === s), p.id))) })),
  };
}

/** Running games over .500, week by week across every season. */
export function trajectory(games: SG[], who: { id: string; name: string }[]) {
  const weeks: { wi: number; label: string }[] = [];
  for (const g of games) if (weeks.at(-1)?.wi !== g.wi) weeks.push({ wi: g.wi, label: `${g.season.slice(2)} ${g.week.replace(/^Week /, "W")}` });
  const byWeek = new Map<number, SG[]>();
  for (const g of games) byWeek.set(g.wi, [...(byWeek.get(g.wi) ?? []), g]);
  return {
    labels: ["Start", ...weeks.map((w) => w.label)],
    series: who.map((p) => {
      let net = 0;
      return { ...p, values: [0, ...weeks.map((w) => { const r = rec(byWeek.get(w.wi)!, p.id); net += r.w - r.l; return net; })] };
    }),
  };
}

// ---------- the market ----------
/** How the lines themselves played out: what blindly taking one side would have done. */
export function market(games: SG[]) {
  const blind = (label: string, sub: string, pick: (g: SG) => string | null) => {
    const r: Rec = { w: 0, l: 0, p: 0 };
    for (const g of games) {
      const p = pick(g);
      if (!p) continue;
      if (g.result === "PUSH") r.p++; else if (p === g.result) r.w++; else r.l++;
    }
    return { id: label, label, sub, rec: r, pct: pct(r) };
  };
  const dog = (g: SG) => (g.fav === g.home ? g.away : g.home);
  return [
    blind("Always home", "every home team", (g) => g.home),
    blind("Always road", "every road team", (g) => g.away),
    blind("Always fav", "every favourite", (g) => g.fav),
    blind("Always dog", "every underdog", dog),
    blind("Home dogs", "only when home is getting points", (g) => (g.home !== g.fav ? g.home : null)),
    blind("Road favs", "only when the road team is laying points", (g) => (g.away === g.fav ? g.away : null)),
    blind("Big dogs (10+)", "underdogs getting 10 or more", (g) => (g.spread >= 10 ? dog(g) : null)),
    blind("Short favs (≤3)", "favourites laying 3 or less", (g) => (g.spread <= 3 ? g.fav : null)),
  ];
}

// ---------- tendencies ----------
/** What share of each picker's picks went to dogs and to home teams. */
export function tendencies(games: SG[], who: { id: string; name: string }[]) {
  return who.map((p) => {
    const mine = games.filter((g) => g.picks[p.id]);
    const n = mine.length;
    const dogs = mine.filter((g) => g.picks[p.id] !== g.fav).length;
    const homes = mine.filter((g) => g.picks[p.id] === g.home).length;
    return { ...p, n, dog: n ? dogs / n : 0, home: n ? homes / n : 0 };
  }).filter((t) => t.n);
}

// ---------- streaks & weeks ----------
export interface Streak { len: number; from: string; to: string }
const spot = (g: SG) => `${g.season} ${g.week}`;

/** Longest win and loss streaks game by game (pushes don't break a streak), and the current one. */
export function streaks(games: SG[], who: string) {
  let best: Streak = { len: 0, from: "", to: "" }, worst: Streak = { len: 0, from: "", to: "" };
  let run = 0, kind: "W" | "L" | null = null, start = "";
  for (const g of games) {
    const p = g.picks[who];
    if (!p || g.result === "PUSH") continue;
    const k = p === g.result ? "W" : "L";
    if (k === kind) run++; else { kind = k; run = 1; start = spot(g); }
    if (k === "W" && run > best.len) best = { len: run, from: start, to: spot(g) };
    if (k === "L" && run > worst.len) worst = { len: run, from: start, to: spot(g) };
  }
  return { best, worst, current: kind ? { kind, len: run } : null };
}

export interface WeekRec { who: string; season: string; week: string; rec: Rec; pct: number }
/** Every week each picker had at least `min` decisions, best first. */
export function weekRecords(games: SG[], who: string[], min = 10): WeekRec[] {
  const out: WeekRec[] = [];
  const byWeek = new Map<number, SG[]>();
  for (const g of games) byWeek.set(g.wi, [...(byWeek.get(g.wi) ?? []), g]);
  for (const gs of byWeek.values()) for (const id of who) {
    const r = rec(gs, id);
    if (decided(r) >= min) out.push({ who: id, season: gs[0].season, week: gs[0].week, rec: r, pct: pct(r)! });
  }
  return out.sort((a, b) => b.pct - a.pct || b.rec.w - a.rec.w);
}

// ---------- teams ----------
export interface TeamRec { team: string; lg: string; rec: Rec; pct: number }
/** Record each picker has when backing each team (min decisions). */
export function teamRecords(games: SG[], who: string, min = 8): TeamRec[] {
  const m = new Map<string, { lg: string; r: Rec }>();
  for (const g of games) {
    const p = g.picks[who];
    if (!p || g.result === "PUSH") continue;
    const k = `${g.lg}|${p}`;
    const e = m.get(k) ?? { lg: g.lg, r: { w: 0, l: 0, p: 0 } };
    if (p === g.result) e.r.w++; else e.r.l++;
    m.set(k, e);
  }
  return [...m.entries()].filter(([, e]) => decided(e.r) >= min)
    .map(([k, e]) => ({ team: k.split("|")[1], lg: e.lg, rec: e.r, pct: pct(e.r)! }))
    .sort((a, b) => b.pct - a.pct || decided(b.rec) - decided(a.rec));
}

/** Teams picked most often by anyone in the group. */
export function mostPicked(games: SG[], who: string[], top = 8) {
  const m = new Map<string, { n: number; r: Rec }>();
  for (const g of games) for (const id of who) {
    const p = g.picks[id];
    if (!p) continue;
    const k = `${g.lg}|${p}`;
    const e = m.get(k) ?? { n: 0, r: { w: 0, l: 0, p: 0 } };
    e.n++;
    if (g.result === "PUSH") e.r.p++; else if (p === g.result) e.r.w++; else e.r.l++;
    m.set(k, e);
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, top).map(([k, e]) => ({ team: k.split("|")[1], lg: k.split("|")[0], n: e.n, rec: e.r, pct: pct(e.r) }));
}

/** Teams that covered the most and least often, regardless of who picked them. */
export function coverLeaders(games: SG[], min = 8) {
  const m = new Map<string, { lg: string; r: Rec }>();
  for (const g of games) for (const t of [g.away, g.home]) {
    const k = `${g.lg}|${t}`;
    const e = m.get(k) ?? { lg: g.lg, r: { w: 0, l: 0, p: 0 } };
    if (g.result === "PUSH") e.r.p++; else if (t === g.result) e.r.w++; else e.r.l++;
    m.set(k, e);
  }
  const all = [...m.entries()].filter(([, e]) => decided(e.r) >= min).map(([k, e]) => ({ team: k.split("|")[1], lg: e.lg, rec: e.r, pct: pct(e.r)! }));
  return { best: [...all].sort((a, b) => b.pct - a.pct || b.rec.w - a.rec.w).slice(0, 5), worst: [...all].sort((a, b) => a.pct - b.pct || b.rec.l - a.rec.l).slice(0, 5) };
}

// ---------- the group (seasons with all four) ----------
const fourGames = (games: SG[]) => games.filter((g) => PEOPLE.every((p) => g.picks[p.id]));

/** Record of the group's side by how lopsided the vote was. */
export function consensus(games: SG[]) {
  const four = fourGames(games);
  const out = { "4-0": { w: 0, l: 0, p: 0 } as Rec, "3-1": { w: 0, l: 0, p: 0 } as Rec, n22: 0 };
  for (const g of four) {
    const a = PEOPLE.filter((p) => g.picks[p.id] === g.away).length;
    if (a === 2) { out.n22++; continue; }
    const side = a > 2 ? g.away : g.home;
    const r = a === 0 || a === 4 ? out["4-0"] : out["3-1"];
    if (g.result === "PUSH") r.p++; else if (side === g.result) r.w++; else r.l++;
  }
  return { ...out, n: four.length };
}

/** Each player's record when they were the lone dissenter in a 3-1. */
export function soloRecords(games: SG[]) {
  const four = fourGames(games);
  return PEOPLE.map((p) => {
    const r: Rec = { w: 0, l: 0, p: 0 };
    for (const g of four) {
      const mine = g.picks[p.id];
      if (PEOPLE.filter((q) => g.picks[q.id] === mine).length !== 1) continue;
      if (g.result === "PUSH") r.p++; else if (mine === g.result) r.w++; else r.l++;
    }
    return { ...p, rec: r, pct: pct(r) };
  });
}

/** How often each pair picked the same side. */
export function agreement(games: SG[]) {
  const out: { id: string; a: string; b: string; same: number; n: number }[] = [];
  for (let i = 0; i < PEOPLE.length; i++) for (let j = i + 1; j < PEOPLE.length; j++) {
    const a = PEOPLE[i], b = PEOPLE[j];
    const both = games.filter((g) => g.picks[a.id] && g.picks[b.id]);
    out.push({ id: `${a.id}-${b.id}`, a: a.name, b: b.name, same: both.filter((g) => g.picks[a.id] === g.picks[b.id]).length, n: both.length });
  }
  return out.filter((x) => x.n).sort((x, y) => y.same / y.n - x.same / x.n);
}

// ---------- awards ----------
export interface Award { key: string; title: string; blurb: string; who: string[]; stat: string; n: number }

/** Playful titles, each backed by a real number. Needs `min` decisions in the category to qualify. */
export function awards(games: SG[], min = 40): Award[] {
  const people = PEOPLE.filter((p) => games.some((g) => g.picks[p.id]));
  if (!people.length) return [];
  const out: Award[] = [];
  const pickBest = (key: string, title: string, blurb: string, f: (id: string) => { v: number; stat: string; n: number } | null, low = false) => {
    const c = people.map((p) => ({ p, s: f(p.id) })).filter((x) => x.s && x.s.n >= min) as { p: { id: string; name: string }; s: { v: number; stat: string; n: number } }[];
    if (!c.length) return;
    c.sort((a, b) => (low ? a.s.v - b.s.v : b.s.v - a.s.v));
    const tied = c.filter((x) => Math.abs(x.s.v - c[0].s.v) < 1e-9);
    out.push({ key, title, blurb, who: tied.map((x) => x.p.id), stat: c[0].s.stat, n: c[0].s.n });
  };
  const pctStat = (pred?: Pred) => (id: string) => { const r = rec(games, id, pred); const n = decided(r); return n ? { v: pct(r)!, stat: `${r.w}-${r.l} (${Math.round(pct(r)! * 1000) / 10}%)`, n } : null; };
  const share = (pred: Pred, what: string) => (id: string) => {
    const mine = games.filter((g) => g.picks[id]); const k = mine.filter((g) => pred(g, g.picks[id])).length;
    return mine.length ? { v: k / mine.length, stat: `${Math.round((k / mine.length) * 100)}% of picks on ${what}`, n: mine.length } : null;
  };
  pickBest("dog", "Dog Whisperer", "Best record taking the points", pctStat((g, p) => !isFav(g, p)));
  pickBest("chalk", "Chalk Eater", "Most likely to lay the points", share(isFav, "favourites"));
  pickBest("homer", "Homer", "Loves the home team", share(isHome, "home teams"));
  pickBest("road", "Road Warrior", "Best record on road teams", pctStat((g, p) => !isHome(g, p)));
  pickBest("nfl", "Sunday Sharp", "Best NFL record", pctStat((g) => g.lg === "NFL"));
  pickBest("cfb", "Saturday Savant", "Best college record", pctStat((g) => g.lg === "NCAA"));
  pickBest("big", "Big-Spread Brain", "Best when the line is 10+", pctStat((g) => g.spread >= 10));
  pickBest("post", "Bowl Season Wizard", "Best in bowls and playoffs", pctStat((g) => isPost(g)));
  // Streaks: no minimum beyond having picked.
  const st = people.map((p) => ({ p, s: streaks(games, p.id) }));
  const top = (k: "best" | "worst") => {
    const len = Math.max(...st.map((x) => x.s[k].len));
    return { len, who: st.filter((x) => x.s[k].len === len) };
  };
  const hot = top("best"), cold = top("worst");
  const when = (x: Streak) => (x.from === x.to ? x.from : `${x.from} → ${x.to}`);
  const whens = (xs: typeof st, k: "best" | "worst") => xs.map((x) => (xs.length > 1 ? `${x.p.name}: ${when(x.s[k])}` : when(x.s[k]))).join("; ");
  if (hot.len) out.push({ key: "heater", title: "Heater", blurb: "Longest run of covers in a row", who: hot.who.map((x) => x.p.id), stat: `${hot.len} straight (${whens(hot.who, "best")})`, n: hot.len });
  if (cold.len) out.push({ key: "ice", title: "Ice Cold", blurb: "Longest run of misses in a row", who: cold.who.map((x) => x.p.id), stat: `${cold.len} straight (${whens(cold.who, "worst")})`, n: cold.len });
  pickBest("fade", "Fade Material", "Lowest overall win rate (do the opposite?)", pctStat(), true);
  return out;
}
