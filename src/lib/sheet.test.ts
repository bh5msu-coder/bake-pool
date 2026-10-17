import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRaw } from "./fixture";
import { matchTeam, parseConverter, parseCsv, parseEliminatorTab, parseLine, parsePicksTab, parseSummaryTab, resolveFav } from "./sheet";

const wk6 = fixtureRaw.weeks.find((w) => w.week === 6)!.games;

describe("lines", () => {
  it("parses printed lines", () => {
    expect(parseLine("SEA -2.5")).toEqual({ abbr: "SEA", spread: 2.5 });
    expect(parseLine("Vandy +13.5")).toEqual({ abbr: "Vandy", spread: 13.5 });
    expect(parseLine("nonsense")).toBeNull();
  });
  it("forgives typos in team names", () => {
    expect(matchTeam("Virgina Tech", "Pitt", "Virginia Tech")).toBe("Virginia Tech");
    expect(matchTeam("seattle", "Seattle", "Denver")).toBe("Seattle");
    expect(matchTeam("Win", "Seattle", "Denver")).toBeNull();
    expect(matchTeam("", "Seattle", "Denver")).toBeNull();
  });
  it("resolves favourites from abbreviations it hasn't seen", () => {
    expect(resolveFav("ZZQ", "A", "B")).toBeNull();
    expect(resolveFav("GT", "Georgia Tech", "Clemson")).toBe("Georgia Tech");
    expect(resolveFav("UCF", "UCF", "Baylor")).toBe("UCF");
    expect(resolveFav("NEB", "Nebraska", "Oregon")).toBe("Nebraska");
  });
  it("resolves every favourite on this season's sheet", () => {
    for (const w of fixtureRaw.weeks) for (const g of w.games)
      expect(resolveFav(parseLine(g.line)!.abbr, g.away, g.home), g.line).toBe(g.fav);
  });
});

describe("Converter tab", () => {
  // Rebuild the tab as Google exports it: one game per column, plus scratch columns after.
  const cols = [...wk6, { away: "Rice", home: "Texas State", fav: "Texas State", spread: 9.5, line: "TSU -9.5" }];
  const grid = [
    cols.map((g) => g.away), cols.map((g) => g.home), cols.map((g) => g.fav),
    cols.map((g) => String(-g.spread)), cols.map((g) => g.line), [], ["", "1", "2", "5"],
  ];
  const csv = grid.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");

  it("reads the first 30 games with leagues", () => {
    const games = parseConverter(parseCsv(csv));
    expect(games).toHaveLength(30);
    expect(games[0]).toMatchObject({ num: 1, league: "NFL", away: "Seattle", home: "Denver", fav: "Seattle", spread: 2.5, line: "SEA -2.5" });
    expect(games.filter((g) => g.league === "NFL")).toHaveLength(14);
    expect(games[29]).toMatchObject({ away: "Nebraska", home: "Oregon", league: "NCAA" });
    expect(games.every((g) => !g.problem)).toBe(true);
  });
  it("falls back to the printed line when the favourite cell is blank", () => {
    const g2 = grid.map((r) => [...r]);
    g2[2][0] = "";
    expect(parseConverter(g2)[0].fav).toBe("Seattle");
  });
});

describe("history tabs", () => {
  it("reads week blocks from the Picks tab", () => {
    const head = (w: number) => [[`Week ${w}`], ["Game", "", "", "", "", "", "Picks"], ["Away", "Home", "Pool Line"]];
    const row = (a: string, h: string, line: string, p: string[], maj: string, cl: string, res: string, lg: string) => {
      const r = Array(36).fill("");
      [r[0], r[1], r[2]] = [a, h, line];
      p.forEach((x, i) => (r[6 + i] = x));
      [r[10], r[11], r[14], r[34]] = [maj, cl, res, lg];
      return r;
    };
    const grid = [
      ...head(1),
      row("New England", "Seattle", "SEA -3.5", ["Seattle", "New England", "Seattle", "New England"], "New England", "New England", "New England", "NFL"),
      row("Rutgers", "Boston College", "BC -3.5", ["Boston College", "Boston College", "Boston College", "Boston College"], "Boston College", "Rutgers", "", "NCAA"),
      ...head(2),
      row("Detroit", "Buffalo", "BUF -4.5", ["Detroit", "", "", ""], "", "Buffalo", "", "NFL"),
    ];
    const m = parsePicksTab(grid);
    expect([...m.keys()]).toEqual(["Week 1", "Week 2"]);
    expect(m.get("Week 1")![0]).toMatchObject({ fav: "Seattle", result: "New England", picks: { brad: "Seattle", claude: "New England" } });
    expect(m.get("Week 1")![1]).toMatchObject({ league: "NCAA", result: null, num: 2 });
    expect(m.get("Week 2")![0].picks).toEqual({ brad: "Detroit", claude: "Buffalo" });
  });
  it("reads the Eliminator and Summary tabs", () => {
    const e = parseEliminatorTab([["", "Picks"], ["Week", "Brad"], ["1", "New Orleans", "New Orleans", "Arizona", "New Orleans", "New Orleans"], ["7", "", "", "", "", ""]]);
    expect([...e.keys()]).toEqual([1]);
    expect(e.get(1)).toEqual({ picks: { brad: "New Orleans", andrew: "New Orleans", kevin: "Arizona", eric: "New Orleans" }, majority: "New Orleans" });
    const s = parseSummaryTab([["Total:", "-$1,050"], ["Week", "Entry", "$ Won", "Line Start", "Line End"], ["5", "$60", "$200.00", "136", "165"],
      ["Bowl", "$60", "$0", "479", "513"], ["Total", "$1250", "$200"]]);
    expect(s.periods).toEqual([{ order: 1, label: "Week 5", games: 30, winnings: 200, start: 136 }, { order: 2, label: "Bowl", games: 35, winnings: 0, start: 479 }]);
    expect(s.seasonFee).toBe(1250);
  });
});

// The real sheet, exported 16 Oct 2026.
describe("the real BAKE sheet", () => {
  const tab = (t: string) => parseCsv(readFileSync(path.join(__dirname, "../fixtures/sheet", `${t}.csv`), "utf8"));

  it("Summary: 21 periods, $1,250 season fee, varying slate sizes", () => {
    const { periods, seasonFee } = parseSummaryTab(tab("Summary"));
    expect(seasonFee).toBe(1250);
    expect(periods.map((p) => p.label)).toEqual([
      ...Array.from({ length: 15 }, (_, i) => `Week ${i + 1}`), "Bowl", "Week 16", "Week 17", "Week 18", "CFP", "Playoffs",
    ]);
    expect(periods.map((p) => p.games)).toEqual([30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 23, 17, 35, 16, 16, 16, 11, 13]);
    expect(periods[4].winnings).toBe(200);
  });

  it("Picks: weeks 1-5 match the graded season", () => {
    const blocks = parsePicksTab(tab("Picks"));
    // The live sheet has one Claude pick that differs from the earlier snapshot (W3 G26); the sheet wins.
    const claudeDiffs: string[] = [];
    for (const w of fixtureRaw.weeks.filter((x) => x.week <= 5)) {
      const got = blocks.get(`Week ${w.week}`)!;
      expect(got).toHaveLength(30);
      got.forEach((g, i) => {
        const want = w.games[i];
        const { claude, ...humansPicked } = g.picks;
        const { claude: wantClaude, ...wantHumans } = want.picks;
        if (claude !== wantClaude) claudeDiffs.push(`W${w.week} G${i + 1}`);
        expect({ a: g.away, h: g.home, fav: g.fav, res: g.result, picks: humansPicked }, `W${w.week} G${i + 1}`)
          .toEqual({ a: want.away, h: want.home, fav: want.fav, res: want.result, picks: wantHumans });
      });
    }
    expect(claudeDiffs).toEqual(["W3 G26"]);
    expect(blocks.get("Week 6")!.filter((g) => Object.keys(g.picks).length === 5)).toHaveLength(30);
  });

  it("Converter: first 30 columns are the Week 6 slate", () => {
    const games = parseConverter(tab("Converter"), 30);
    expect(games.map((g) => `${g.away}@${g.home} ${g.line}`)).toEqual(wk6.map((g) => `${g.away}@${g.home} ${g.line}`));
    expect(games.every((g) => !g.problem)).toBe(true);
  });

  it("Eliminator: weeks 1-6 voted", () => {
    expect([...parseEliminatorTab(tab("Eliminator")).keys()]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
