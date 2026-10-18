// THE POOL (the 45-entry league BAKE plays in): parse its Google Sheet and simulate the rest of the season.
// Pure functions: the API route fetches the tabs and passes the grids in.
import type { Grid } from "./sheet";

export const LEAGUE_GID = { champ: "0", money: "816342207", elim: "1006055009" } as const;

const cell = (g: Grid, r: number, c: number) => (g[r]?.[c] ?? "").trim();
const num = (s: string) => { const v = parseFloat(String(s).replace(/[$,%\s]/g, "")); return Number.isFinite(v) ? v : NaN; };

export interface ChampRow {
  entry: string; total: number; rankText: string;
  weekly: Record<string, number>; // wins per period label ("1".."15","B","16","17","18","CFP","P")
  rankByWeek: Record<string, number>;
}
export interface Champ { periods: string[]; pot: number; places: number[]; rows: ChampRow[] }

/** Championship tab: header row with ENTRY in column D, then blocks Week (wins) | Cumulative | Rank by week. */
export function parseChamp(R: Grid): Champ {
  const hr = R.findIndex((row) => /^ENTRY$/i.test((row[3] ?? "").trim()));
  if (hr < 0) throw new Error("Couldn't find the Championship table (ENTRY header).");
  // Blocks restart at "1": [0] weekly wins, [1] cumulative, [2] rank by week.
  const blocks: Record<string, number>[] = [];
  for (let c = 5; c < (R[hr]?.length ?? 0); c++) {
    const l = cell(R, hr, c);
    if (l === "1") blocks.push({});
    if (blocks.length && /^(\d+|B|CFP|P)$/.test(l)) blocks.at(-1)![l] = c;
  }
  const periods = Object.keys(blocks[0] ?? {}).sort((a, b) => blocks[0][a] - blocks[0][b]);
  // Payout row: "Pot" amount then 1st..4th.
  let pot = NaN; const places: number[] = [];
  for (let r = 0; r < hr; r++) {
    const dollars = (R[r] ?? []).map((v) => v.trim()).filter((v) => v.startsWith("$")).map(num);
    if (dollars.length >= 3) { pot = dollars[0]; places.push(...dollars.slice(1)); break; }
  }
  const rows: ChampRow[] = [];
  for (let r = hr + 1; r < R.length; r++) {
    const entry = cell(R, r, 3);
    if (!entry || !/^[A-Za-z0-9&.' -]{1,12}$/.test(entry)) continue;
    const weekly: Record<string, number> = {}, rankByWeek: Record<string, number> = {};
    for (const p of periods) {
      const w = num(cell(R, r, blocks[0][p])); if (!Number.isNaN(w)) weekly[p] = w;
      if (blocks[2]?.[p] !== undefined) { const k = num(cell(R, r, blocks[2][p])); if (!Number.isNaN(k)) rankByWeek[p] = k; }
    }
    rows.push({ entry, total: num(cell(R, r, 4)) || 0, rankText: cell(R, r, 2), weekly, rankByWeek });
  }
  return { periods, pot, places: places.length ? places : [2500, 1250, 500, 250], rows };
}

export interface MoneyRow { entry: string; byWeek: Record<string, number>; elim: number; champ: number; total: number }

/** Money tab: ENTRY | weeks… | Elim | Champ | Total. */
export function parseMoney(R: Grid): MoneyRow[] {
  const hr = R.findIndex((row) => /^ENTRY$/i.test((row[0] ?? "").trim()));
  if (hr < 0) return [];
  const width = R[hr].length;
  const labels = R[hr].map((v) => v.trim());
  // The last three dollar columns are Elim, Champ, Total (their labels sit on the row above).
  const out: MoneyRow[] = [];
  for (let r = hr + 1; r < R.length; r++) {
    const entry = cell(R, r, 0);
    if (!entry) continue;
    const dollarCols = [] as number[];
    for (let c = 1; c < width; c++) if (cell(R, r, c).startsWith("$")) dollarCols.push(c);
    const tail = dollarCols.slice(-3);
    const byWeek: Record<string, number> = {};
    for (let c = 1; c < width; c++) {
      if (tail.includes(c)) continue;
      const v = num(cell(R, r, c));
      if (v > 0 && labels[c]) byWeek[labels[c]] = v;
    }
    const [elim, champ, total] = tail.length === 3 ? tail.map((c) => num(cell(R, r, c)) || 0) : [0, 0, Object.values(byWeek).reduce((a, b) => a + b, 0)];
    out.push({ entry, byWeek, elim, champ, total });
  }
  return out;
}

export interface ElimRow { entry: string; alive: boolean; losses: number; rebuy: boolean; picks: string[] }
export interface Elim { alive: number; noLoss: number; oneLoss: number; eliminated: number; pot: number; places: number[]; rows: ElimRow[] }

/** Elimination tab: stat block (Alive / No Losses / One Loss / Eliminated), payouts, then one row per entry. */
export function parseElim(R: Grid): Elim {
  const stat = (re: RegExp) => {
    for (let r = 0; r < 8; r++) for (let c = 0; c < (R[r]?.length ?? 0); c++)
      if (re.test(cell(R, r, c))) for (let k = c + 1; k < R[r].length; k++) { const v = num(cell(R, r, k)); if (!Number.isNaN(v)) return v; }
    return NaN;
  };
  let pot = NaN; const places: number[] = [];
  for (let r = 0; r < 8; r++) {
    const d = (R[r] ?? []).map((v) => v.trim()).filter((v) => v.startsWith("$")).map(num);
    if (d.length >= 3) { pot = d[0]; places.push(...d.slice(1)); break; }
  }
  const hr = R.findIndex((row) => (row[5] ?? "").trim() === "Entry");
  const rows: ElimRow[] = [];
  const seen = new Set<string>();
  for (let r = hr + 1; hr >= 0 && r < R.length; r++) {
    const entry = cell(R, r, 5), alive = cell(R, r, 3);
    if (!entry || (alive !== "TRUE" && alive !== "FALSE") || seen.has(entry)) continue;
    seen.add(entry);
    const picks: string[] = [];
    for (let k = 0; k < 18; k++) picks.push(cell(R, r, 8 + 2 * k));
    while (picks.length && !picks.at(-1)) picks.pop();
    rows.push({ entry, alive: alive === "TRUE", losses: num(cell(R, r, 2)) || 0, rebuy: cell(R, r, 4) === "TRUE", picks });
  }
  return { alive: stat(/^Alive:/), noLoss: stat(/^No Losses:/), oneLoss: stat(/^One Loss:/), eliminated: stat(/^Eliminated:/), pot, places, rows };
}

// ---------- standings helpers ----------

/** Competition ranking (1, 2, 2, 4) on a numeric key, higher is better. */
export function rankBy<T>(rows: T[], key: (r: T) => number): Map<T, { rank: number; tied: boolean }> {
  const sorted = [...rows].sort((a, b) => key(b) - key(a));
  const out = new Map<T, { rank: number; tied: boolean }>();
  sorted.forEach((r, i) => {
    const rank = i > 0 && key(sorted[i - 1]) === key(r) ? out.get(sorted[i - 1])!.rank : i + 1;
    out.set(r, { rank, tied: false });
  });
  for (const [r, v] of out) v.tied = sorted.filter((x) => key(x) === key(r)).length > 1;
  return out;
}

export function weeklyField(champ: Champ, period: string) {
  const vals = champ.rows.map((r) => r.weekly[period]).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  if (!vals.length) return null;
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))];
  return { min: vals[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: vals.at(-1)!, n: vals.length };
}

// ---------- Monte Carlo ----------

export interface SimInput {
  entries: { entry: string; wins: number }[];
  gradedGames: number;     // games already graded this season (the same slate for every entry)
  remainingGames: number;  // games still to be graded, including the rest of the current week
  places: number[];        // championship payouts, 1st..nth
  sims?: number;
  priorGames?: number;     // how strongly each entry's win rate is pulled toward the field average
  seed?: number;
}
export interface SimResult {
  entry: string; pFirst: number; pMoney: number; expPayout: number;
  p10: number; p50: number; p90: number; current: number;
}

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(rand: () => number) { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); }
/** Marsaglia-Tsang gamma sampler (shape >= 1, which always holds here). */
function gamma(shape: number, rand: () => number) {
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = gauss(rand); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const beta = (a: number, b: number, rand: () => number) => { const x = gamma(a, rand); return x / (x + gamma(b, rand)); };

/**
 * Simulates the rest of the season.
 * Each entry's true against-the-spread rate is uncertain: drawn per simulation from a Beta posterior that
 * blends its record so far with the field average (priorGames of "average" results). The remaining games
 * are then played out (normal approximation to the binomial). Final standings use competition ranking;
 * tied entries split the payouts for the places they cover, as the sheet does.
 */
export function simulate(inp: SimInput): SimResult[] {
  const sims = inp.sims ?? 5000, k = inp.priorGames ?? 300, rand = mulberry32(inp.seed ?? 1);
  const n = inp.entries.length, G = Math.max(1, inp.gradedGames), rem = Math.max(0, inp.remainingGames);
  const fieldRate = inp.entries.reduce((s, e) => s + e.wins, 0) / (n * G);
  const a = inp.entries.map((e) => fieldRate * k + e.wins);
  const b = inp.entries.map((e) => (1 - fieldRate) * k + Math.max(0, G - e.wins));
  const first = new Float64Array(n), money = new Float64Array(n), pay = new Float64Array(n);
  const finals: number[][] = inp.entries.map(() => []);
  const idx = inp.entries.map((_, i) => i);
  const final = new Float64Array(n);

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      const p = beta(a[i], b[i], rand);
      const w = rem ? Math.round(Math.min(rem, Math.max(0, rem * p + Math.sqrt(rem * p * (1 - p)) * gauss(rand)))) : 0;
      final[i] = inp.entries[i].wins + w;
      finals[i].push(final[i]);
    }
    idx.sort((x, y) => final[y] - final[x]);
    for (let pos = 0; pos < n;) {
      let end = pos; while (end + 1 < n && final[idx[end + 1]] === final[idx[pos]]) end++;
      const group = end - pos + 1;
      const purse = inp.places.slice(pos, end + 1).reduce((t, v) => t + v, 0) / group;
      for (let j = pos; j <= end; j++) {
        const i = idx[j];
        if (pos === 0) first[i] += 1 / group;
        if (purse > 0) { money[i] += 1; pay[i] += purse; }
      }
      pos = end + 1;
    }
  }
  const pct = (arr: number[], q: number) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  return inp.entries.map((e, i) => ({
    entry: e.entry, current: e.wins, pFirst: first[i] / sims, pMoney: money[i] / sims, expPayout: pay[i] / sims,
    p10: pct(finals[i], 0.1), p50: pct(finals[i], 0.5), p90: pct(finals[i], 0.9),
  }));
}

/** Stable seed from the current standings, so the odds don't jitter between refreshes of the same data. */
export const seedFrom = (rows: { entry: string; wins: number }[]) =>
  rows.reduce((h, r) => (Math.imul(h ^ (r.wins * 2654435761), 16777619) + r.entry.length) | 0, 2166136261);
