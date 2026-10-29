"use client";
import { useState } from "react";
import { categoryGrid, compareGrid, consensus, headToHeadGrid, pickers, soloRecords, trajectory, weeklyGrid } from "@/lib/analytics";
import { cvar } from "@/lib/players";
import {
  band, BANDS, ENTRY, elimSummary, fmtPct, fmtRec, humans, MAJORITY, money, pct, pickOf, record, shortLabel, side, soloPicker, split,
  type Game, type Rec,
} from "@/lib/scoring";
import { ChartCard, DiffHeatmap, DiffTable, Heatmap, HeatTable, Legend, LineChart, WinBars } from "./charts";
import { Header } from "./ui";
import { emptyFilter, useApp, type ExploreFilter } from "./store";

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

type Sub = "standings" | "compare" | "matchups" | "breakdowns";

export function PoolTab() {
  const { season, me } = useApp();
  const [sub, setSub] = useState<Sub>("standings");
  const ids = humans(season.players).map((p) => p.id);
  const done = season.weeks.flatMap((w) => w.games).filter((g) => g.result);
  const gradedWeeks = season.weeks.filter((w) => w.games.some((g) => g.result));

  if (!done.length) {
    return (<>
      <Header title="Pool" sub="Standings & stats" />
      <main className="wrap"><div className="empty"><b>No results yet</b>Standings appear once the first games are graded.</div></main>
    </>);
  }

  const lastWeek = gradedWeeks.at(-1)!;
  const standings = season.players
    .map((p) => ({ p, r: record(done, p.id, ids), wk: record(lastWeek.games, p.id, ids) }))
    .sort((a, b) => (pct(b.r) ?? 0) - (pct(a.r) ?? 0) || b.r.w - a.r.w);
  const entry = record(done, ENTRY, ids);
  const m = money(season);
  const elim = elimSummary(season);
  const leader = standings[0];
  const traj = trajectory(season);
  const weekly = weeklyGrid(season);
  const cats = categoryGrid(season);
  const h2h = headToHeadGrid(season);
  const cons = consensus(season);
  const solo = soloRecords(season);

  return (<>
    <Header title="Pool" sub={`${done.length} games graded · through ${shortLabel(lastWeek)}`} />
    <main className="wrap">
      <div className="subtabs" role="tablist" aria-label="Pool views">
        {([["standings", "Standings"], ["compare", "Compare"], ["matchups", "Matchups"], ["breakdowns", "Breakdowns"]] as [Sub, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      <div className="dash">
        {sub === "standings" && (<>
        <div className="kpis">
          <div className="kpi hero"><div className="l">Entry record</div><div className="v">{fmtRec(entry)}</div><div className="d">{fmtPct(entry)} against the spread</div></div>
          <div className="kpi"><div className="l"><i className="dot" style={cvar(leader.p.id)} />Leader</div><div className="v">{leader.p.name}</div><div className="d">{fmtRec(leader.r)} · {fmtPct(leader.r)}</div></div>
          <div className="kpi"><div className="l">{shortLabel(lastWeek)} entry</div><div className="v">{fmtRec(record(lastWeek.games, ENTRY, ids))}</div><div className="d">{lastWeek.winnings ? `Won ${usd(lastWeek.winnings)}` : "No payout"}</div></div>
          <div className="kpi"><div className="l">Net each</div><div className={`v ${m.each < 0 ? "neg" : "pos"}`}>{usd(m.each)}</div><div className="d">{usd(m.won)} won of {usd(m.fees)} in</div></div>
          <div className="kpi"><div className="l">Eliminator</div><div className="v">{elim.alive ? `${elim.livesLeft} ${elim.livesLeft === 1 ? "life" : "lives"}` : "Out"}</div><div className="d">{elim.burned.length} teams used</div></div>
        </div>

        <div className="chart-card s5">
          <div className="chart-head"><div><h3>Standings</h3><p>Season record against the spread</p></div></div>
          <div className="list">
            {standings.map(({ p, r, wk }, i) => (
              <div key={p.id} className={`st${p.id === me ? " me" : ""}`}>
                <span className="rk">{i + 1}</span>
                <span className="nm"><i className="dot" style={cvar(p.id)} /><span>{p.name}<small>{shortLabel(lastWeek)}: {fmtRec(wk)}</small></span></span>
                <span className="rc">{fmtRec(r)}</span>
                <span className="pc">{fmtPct(r)}</span>
              </div>
            ))}
            {([[ENTRY, "Entry", "what was submitted"], [MAJORITY, "Majority", "games with 3+ agreeing"]] as const).map(([id, n, sub]) => {
              const r = record(done, id, ids);
              return (
                <div key={id} className="st bench">
                  <span className="rk" /><span className="nm"><i className="dot" style={cvar(id)} /><span>{n}<small>{sub}</small></span></span>
                  <span className="rc">{fmtRec(r)}</span><span className="pc">{fmtPct(r)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <ChartCard className="s7" title="Season race" sub="Games over .500 after each week (wins minus losses)"
          legend={<Legend items={traj.series} />}
          table={<table className="grid"><thead><tr><th>Picker</th>{traj.labels.slice(1).map((l) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>{traj.series.map((s) => <tr key={s.id}><td>{s.name}</td>{s.values.slice(1).map((v, i) => <td key={i}>{v > 0 ? `+${v}` : v}</td>)}</tr>)}</tbody></table>}>
          <LineChart labels={traj.labels} series={traj.series} highlight={[ENTRY, me]} />
        </ChartCard>
        <MoneyAndWeeks />
        </>)}

        {sub === "compare" && <Compare />}

        {sub === "breakdowns" && (<>
        <ChartCard className="s12" title="Week by week" sub="Win % each week · hover or tap a cell for the record"
          table={<HeatTable cols={weekly.cols} rows={weekly.rows} />}>
          <Heatmap cols={weekly.cols} rows={weekly.rows} minCol={40} rowHead={78} />
        </ChartCard>

        <ChartCard className="s12" title="Where each picker wins" sub="Win % by type of game · Favourites/Underdogs follow each picker's own side"
          table={<HeatTable cols={cats.cols} rows={cats.rows} />}>
          <Heatmap cols={cats.cols} rows={cats.rows} minCol={60} />
        </ChartCard>
        </>)}

        {sub === "matchups" && (<>
        <ChartCard className="s7" title="Head to head" sub="Row player's win % on games where the two picked differently"
          table={<HeatTable cols={h2h.cols} rows={h2h.rows} />}>
          <Heatmap cols={h2h.cols} rows={h2h.rows} minCol={58} />
        </ChartCard>

        <ChartCard className="s5" title="Does agreement pay?" sub="Entry win % by how the four of you split"
          table={<table className="grid"><thead><tr><th>Split</th><th>Record</th><th>Win %</th></tr></thead>
            <tbody>{cons.map((c) => <tr key={c.key}><td>{c.label}</td><td>{fmtRec(c.rec)}</td><td>{fmtPct(c.rec)}</td></tr>)}</tbody></table>}>
          <WinBars items={cons.map((c) => ({ id: c.key, label: c.key, sub: c.label, rec: c.rec, pct: c.pct }))} />
          <p className="hint">Solo picks, alone against the other three:</p>
          <WinBars items={solo.map((x) => ({ id: x.id, label: x.name, rec: x.rec, pct: x.pct, color: `var(--p-${x.id})` }))} />
        </ChartCard>

        <Breakdown />
        </>)}
      </div>
    </main>
  </>);
}

type Against = "players" | "group" | "both";

/** One picker's win-% gap against the others, the group, or both, by type of game and by week. */
function Compare() {
  const { season, me } = useApp();
  const [who, setWho] = useState(me);
  const [against, setAgainst] = useState<Against>("both");
  const name = season.players.find((p) => p.id === who)?.name ?? who;
  const players = season.players.filter((p) => p.id !== who).map((p) => p.id);
  const cols = against === "players" ? players : against === "group" ? [ENTRY, MAJORITY] : [...players, ENTRY, MAJORITY];
  const byType = compareGrid(season, who, cols, "type");
  const byWeek = compareGrid(season, who, cols, "week");
  return (<>
    <div className="compare-bar s12">
      <label className="row" style={{ gap: 8 }}>
        <span className="lab">Compare</span>
        <select className="btn" value={who} onChange={(e) => setWho(e.target.value)} style={{ minHeight: 36 }}>
          {season.players.map((p) => <option key={p.id} value={p.id}>{p.id === me ? `${p.name} (you)` : p.name}</option>)}
        </select>
      </label>
      <div className="pills" role="group" aria-label="Against">
        {([["players", "vs players"], ["group", "vs group"], ["both", "Both"]] as [Against, string][]).map(([k, l]) => (
          <button key={k} className="pill" aria-pressed={against === k} onClick={() => setAgainst(k)}>{l}</button>
        ))}
      </div>
    </div>
    <ChartCard className="s12" title={`${name} vs ${against === "players" ? "everyone" : against === "group" ? "the group" : "everyone and the group"}`}
      sub="Win-% gap in points by type of game. Red: better (hot). Blue: worse (cold). Entry is what was submitted; Majority counts games with 3+ agreeing."
      table={<DiffTable who={name} cols={byType.cols} rows={byType.rows} />}>
      <DiffHeatmap who={name} cols={byType.cols} rows={byType.rows} />
    </ChartCard>
    <ChartCard className="s12" title={`${name} week by week`} sub="Win-% gap in points each week"
      table={<DiffTable who={name} cols={byWeek.cols} rows={byWeek.rows} />}>
      <DiffHeatmap who={name} cols={byWeek.cols} rows={byWeek.rows} rowHead={64} minCol={52} />
    </ChartCard>
  </>);
}

function MoneyAndWeeks() {
  const { season } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const gradedWeeks = season.weeks.filter((w) => w.games.some((g) => g.result));
  const m = money(season);
  const ps = pickers(season);
  return (
    <div className="chart-card s12">
      <div className="chart-head"><div><h3>Money &amp; weekly records</h3><p>The week&apos;s best player is in bold</p></div></div>
      <div className="money" style={{ marginBottom: 14 }}>
        <div><span>Paid in</span><b>{usd(m.fees)}</b></div>
        <div><span>Won</span><b className="pos">{usd(m.won)}</b></div>
        <div><span>Group net</span><b className={m.net < 0 ? "neg" : "pos"}>{usd(m.net)}</b></div>
      </div>
      <div className="tablewrap">
        <table className="grid">
          <thead><tr><th>Week</th>{ps.map((p) => <th key={p.id}><span className="row" style={{ gap: 5, justifyContent: "center" }}><i className="dot" style={cvar(p.id)} />{p.name}</span></th>)}<th>$</th></tr></thead>
          <tbody>
            {gradedWeeks.map((w) => {
              const recs = ps.map((p) => record(w.games, p.id, ids));
              const best = Math.max(...recs.slice(0, -1).map((r) => r.w));
              return (
                <tr key={w.week}>
                  <td>{shortLabel(w)}</td>
                  {recs.map((r, i) => <td key={i} style={{ fontWeight: i < recs.length - 1 && r.w === best ? 700 : 400 }}>{fmtRec(r)}</td>)}
                  <td className={w.winnings ? "pos" : ""}>{w.winnings ? usd(w.winnings) : "·"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">{usd(season.seasonFee)} season entry{m.buybacks ? ` + ${usd(m.buybacks)} eliminator buy-back` : ""}{m.other ? ` ${m.other < 0 ? "+" : "−"} ${usd(Math.abs(m.other))} other` : ""}, split four ways.</p>
    </div>
  );
}

function Breakdown() {
  const { season, me, setTab, setFilter } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const done = season.weeks.flatMap((w) => w.games).filter((g) => g.result);
  const [who, setWho] = useState(me);
  const open = (f: Partial<ExploreFilter>) => {
    setFilter({ ...emptyFilter(who), ...f, picker: who });
    setTab("explore");
    window.scrollTo({ top: 0 });
  };
  const rec = (pred: (g: Game) => boolean) => record(done.filter(pred), who, ids);
  const picked = (g: Game) => pickOf(g, who, ids);
  const slices: { k: string; r: Rec; f?: Partial<ExploreFilter> }[] = [
    { k: "Underdogs", r: rec((g) => side(g, picked(g)) === "Dog"), f: { side: new Set(["Dog"]) } },
    { k: "Favourites", r: rec((g) => side(g, picked(g)) === "Fav"), f: { side: new Set(["Fav"]) } },
    { k: "2-2 splits", r: rec((g) => split(g, ids) === "2-2"), f: { split: new Set(["2-2"]) } },
    { k: "NFL", r: rec((g) => g.league === "NFL"), f: { league: new Set(["NFL"]) } },
    { k: "College", r: rec((g) => g.league === "NCAA"), f: { league: new Set(["NCAA"]) } },
    ...BANDS.map((b) => ({ k: `Spread ${b}`, r: rec((g) => band(g.spread) === b), f: { band: new Set([b]) } })),
  ];
  if (ids.includes(who)) slices.push({ k: "Solo picks", r: rec((g) => soloPicker(g, ids) === who) });
  return (
    <div className="chart-card s12">
      <div className="chart-head"><div><h3>Drill into games</h3><p>Tap a row to open those games in Explore</p></div></div>
      <div className="rail" style={{ marginBottom: 6 }}>
        {season.players.map((p) => (
          <button key={p.id} className="pill" aria-pressed={who === p.id} onClick={() => setWho(p.id)}><i className="dot" style={cvar(p.id)} />{p.name}</button>
        ))}
      </div>
      <div className="list">
        {slices.map((s) => (
          <button key={s.k} className="slice" onClick={() => s.f && open(s.f)} disabled={!s.f}>
            <span className="k">{s.k}</span>
            <span className="r">{fmtRec(s.r)} · {fmtPct(s.r)}</span>
            <span className="go">{s.f ? "›" : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
