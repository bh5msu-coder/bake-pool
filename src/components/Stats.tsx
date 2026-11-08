"use client";
// Stats tab: every graded game since 2024-25 (the old sheets) plus this season. Human picks and the
// submitted entry only; Claude never appears here.
import { useMemo, useState, type CSSProperties } from "react";
import hist from "@/lib/history.json";
import { cvar } from "@/lib/players";
import { fmtPct, fmtRec, pct, type Rec } from "@/lib/scoring";
import {
  agreement, allGames, awards, bandSplits, BREAKEVEN, consensus, coverLeaders, grid, market, mostPicked, PEOPLE, profit, rec,
  seasonGrid, seasonsOf, SMALL, soloRecords, SPLITS, streaks, SUBMITTED, teamRecords, tendencies, trajectory, weekRecords,
  type HistoryFile, type SG, type TeamRec,
} from "@/lib/stats";
import { ChartCard, Heatmap, HeatTable, Legend, LineChart, WinBars } from "./charts";
import { useApp } from "./store";
import { Header } from "./ui";

type Sub = "overview" | "splits" | "teams" | "fun";
type Lg = "all" | "NFL" | "NCAA";

const usd = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString("en-US")}`;
const n = (r: Rec) => r.w + r.l;
const thin = (r: Rec) => (n(r) < SMALL ? " · small sample" : "");
const nameOf = (id: string) => [...PEOPLE, SUBMITTED].find((p) => p.id === id)?.name ?? id;
const BE = { at: BREAKEVEN, label: "52.4%" };

export function StatsTab() {
  const { season } = useApp();
  const everything = useMemo(() => allGames(hist as HistoryFile, season), [season]);
  const seasons = seasonsOf(everything);
  const [sub, setSub] = useState<Sub>("overview");
  const [sea, setSea] = useState<string>("all");
  const [lg, setLg] = useState<Lg>("all");

  const games = useMemo(
    () => everything.filter((g) => (sea === "all" || g.season === sea) && (lg === "all" || g.lg === lg)),
    [everything, sea, lg],
  );
  const who = [...PEOPLE, SUBMITTED].filter((p) => games.some((g) => g.picks[p.id]));
  const scope = `${sea === "all" ? "All seasons" : sea} · ${lg === "all" ? "NFL + CFB" : lg === "NFL" ? "NFL" : "CFB"}`;

  return (<>
    <Header title="Stats" sub={`${everything.length.toLocaleString()} games since 2024-25`} />
    <main className="wrap">
      <div className="subtabs" role="tablist" aria-label="Stats views">
        {([["overview", "Overview"], ["splits", "Splits"], ["teams", "Teams"], ["fun", "Fun"]] as [Sub, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      <div className="filters">
        <div className="grp" role="group" aria-label="Season"><span>Season</span><div className="pills">
          {["all", ...seasons].map((s) => <button key={s} className="pill" aria-pressed={sea === s} onClick={() => setSea(s)}>{s === "all" ? "All" : s}</button>)}
        </div></div>
        <div className="grp" role="group" aria-label="League"><span>League</span><div className="pills">
          {([["all", "Both"], ["NFL", "NFL"], ["NCAA", "CFB"]] as [Lg, string][]).map(([k, l]) => <button key={k} className="pill" aria-pressed={lg === k} onClick={() => setLg(k)}>{l}</button>)}
        </div></div>
      </div>
      {!games.length ? (
        <div className="empty"><b>No graded games here</b>Try another season or league.</div>
      ) : (
        <div className="dash">
          {sub === "overview" && <Overview games={games} who={who} scope={scope} />}
          {sub === "splits" && <Splits games={games} who={who} scope={scope} />}
          {sub === "teams" && <Teams games={games} scope={scope} />}
          {sub === "fun" && <Fun games={games} who={who} scope={scope} />}
        </div>
      )}
      <p className="hint" style={{ paddingBottom: 24 }}>
        2024-25 is Brad (“Bard”) and Andrew (“Andy”) only; Kevin and Eric join in 2025-26, when the submitted entry starts.
        Records are rebuilt game by game from each season&apos;s sheet. Claude&apos;s picks aren&apos;t counted anywhere on this page.
        At −110 you need 52.4% to break even.
      </p>
    </main>
  </>);
}

type P = { games: SG[]; who: { id: string; name: string }[]; scope: string };

function Overview({ games, who, scope }: P) {
  const rows = who.map((p) => {
    const r = rec(games, p.id);
    const yrs = seasonsOf(games.filter((g) => g.picks[p.id]));
    return { ...p, r, yrs, pct: pct(r) ?? 0 };
  }).sort((a, b) => b.pct - a.pct);
  const people = rows.filter((x) => x.id !== SUBMITTED.id && n(x.r) >= 100);
  const leader = people[0] ?? rows[0];
  const heat = seasonGrid(games, who);
  const traj = trajectory(games, who);
  const mk = market(games);
  const homeCover = mk[0], favCover = mk[2];
  const best = [...people].sort((a, b) => profit(b.r) - profit(a.r))[0];

  return (<>
    <div className="kpis">
      <div className="kpi hero"><div className="l">Games tracked</div><div className="v">{games.length.toLocaleString()}</div><div className="d">{scope}</div></div>
      <div className="kpi"><div className="l"><i className="dot" style={cvar(leader.id)} />Best win %</div><div className="v">{leader.name}</div><div className="d">{fmtRec(leader.r)} · {fmtPct(leader.r)}</div></div>
      {best && <div className="kpi"><div className="l">Best bankroll</div><div className={`v ${profit(best.r) < 0 ? "neg" : "pos"}`}>{usd(profit(best.r))}</div><div className="d">{best.name}, $100 a game at −110</div></div>}
      <div className="kpi"><div className="l">Favs covered</div><div className="v">{fmtPct(favCover.rec)}</div><div className="d">{fmtRec(favCover.rec)} on every line</div></div>
      <div className="kpi"><div className="l">Home covered</div><div className="v">{fmtPct(homeCover.rec)}</div><div className="d">{fmtRec(homeCover.rec)} on every line</div></div>
    </div>

    <div className="chart-card s5">
      <div className="chart-head"><div><h3>All-time leaderboard</h3><p>Against the spread · {scope}</p></div></div>
      <div>
        <div className="lb hd"><span /><span>Picker</span><span className="num">Record</span><span className="num">Win %</span><span className="num hide-s">vs 52.4%</span><span className="num">$100/game</span></div>
        {rows.map((x, i) => {
          const edge = Math.round(((x.pct) - BREAKEVEN) * 1000) / 10;
          const p$ = profit(x.r);
          return (
            <div className="lb" key={x.id}>
              <span className="rk" style={{ color: "var(--faint)", fontSize: ".8rem" }}>{x.id === SUBMITTED.id ? "" : i + 1}</span>
              <span className="nm"><i className="dot" style={cvar(x.id)} /><span>{x.name}<small>{x.yrs.length > 1 ? `${x.yrs.length} seasons` : x.yrs[0]} · {n(x.r)} picks{thin(x.r)}</small></span></span>
              <span className="num" style={{ fontWeight: 600 }}>{fmtRec(x.r)}</span>
              <span className="num">{fmtPct(x.r)}</span>
              <span className={`num hide-s ${edge >= 0 ? "pos" : "neg"}`}>{edge > 0 ? "+" : ""}{edge} pts</span>
              <span className={`num ${p$ < 0 ? "neg" : "pos"}`}>{usd(p$)}</span>
            </div>
          );
        })}
      </div>
      <p className="hint">$100 a game at −110: a win pays $90.91, a loss costs $100. That&apos;s why 50% loses money.</p>
    </div>

    <ChartCard className="s7" title="The long race" sub="Games over .500, week by week (wins minus losses)"
      legend={<Legend items={traj.series} />}
      table={<table className="grid"><thead><tr><th>Picker</th>{traj.labels.slice(1).map((l, i) => <th key={i}>{l}</th>)}</tr></thead>
        <tbody>{traj.series.map((s) => <tr key={s.id}><td>{s.name}</td>{s.values.slice(1).map((v, i) => <td key={i}>{v > 0 ? `+${v}` : v}</td>)}</tr>)}</tbody></table>}>
      <LineChart labels={traj.labels} series={traj.series} highlight={traj.series.map((s) => s.id)} />
    </ChartCard>

    <ChartCard className="s12" title="Season by season" sub="Win % each season · tap a cell for the record"
      table={<HeatTable cols={heat.cols} rows={heat.rows} />}>
      <Heatmap cols={heat.cols} rows={heat.rows} minCol={80} thinBelow={SMALL} />
    </ChartCard>
  </>);
}

function Splits({ games, who, scope }: P) {
  const sp = grid(games, who, SPLITS);
  const bands = grid(games, who, bandSplits);
  const mk = market(games);
  const tend = tendencies(games, who);
  const dogRate = pct(mk[3].rec) ?? 0, homeRate = pct(mk[0].rec) ?? 0;
  const homeRows = SPLITS.slice(0, 2), sideRows = SPLITS.slice(2, 4);

  return (<>
    <ChartCard className="s12" title="Where each picker wins" sub={`Win % by the side you took · ${scope}`}
      table={<HeatTable cols={sp.cols} rows={sp.rows} />}>
      <Heatmap cols={sp.cols} rows={sp.rows} minCol={62} thinBelow={SMALL} />
    </ChartCard>

    {(["Home vs road", "Fav vs dog"] as const).map((t, k) => {
      const set = k === 0 ? homeRows : sideRows;
      const items = who.flatMap((p) => set.map((s) => {
        const r = rec(games, p.id, s.test);
        return { id: `${p.id}-${s.key}`, label: `${p.name} · ${s.label}`, sub: `${n(r)} picks${thin(r)}`, rec: r, pct: pct(r), color: `var(--p-${p.id})` };
      }));
      return (
        <ChartCard key={t} className="s6" title={t} sub="Dashed line is the 52.4% breakeven"
          table={<table className="grid"><thead><tr><th>Picker</th>{set.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
            <tbody>{who.map((p) => <tr key={p.id}><td>{p.name}</td>{set.map((s) => { const r = rec(games, p.id, s.test); return <td key={s.key}>{fmtRec(r)} ({fmtPct(r)})</td>; })}</tr>)}</tbody></table>}>
          <WinBars items={items} mark={BE} diverge={0.15} />
        </ChartCard>
      );
    })}

    <ChartCard className="s6" title="What the lines did" sub="If you'd blindly taken one side of every game"
      table={<table className="grid"><thead><tr><th>Strategy</th><th>Record</th><th>Win %</th></tr></thead>
        <tbody>{mk.map((m) => <tr key={m.id}><td>{m.label}</td><td>{fmtRec(m.rec)}</td><td>{fmtPct(m.rec)}</td></tr>)}</tbody></table>}>
      <WinBars items={mk.map((m) => ({ ...m, sub: `${m.sub} · ${n(m.rec)}${thin(m.rec)}` }))} mark={BE} diverge={0.15} />
    </ChartCard>

    <ChartCard className="s6" title="Pick tendencies" sub="Share of each picker's picks · marker = how often that side actually covered"
      table={<table className="grid"><thead><tr><th>Picker</th><th>Picks</th><th>On dogs</th><th>On home</th></tr></thead>
        <tbody>{tend.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.n}</td><td>{Math.round(t.dog * 100)}%</td><td>{Math.round(t.home * 100)}%</td></tr>)}</tbody></table>}>
      <ShareBars title="Took the underdog" rate={dogRate} rateLabel={`dogs covered ${Math.round(dogRate * 100)}%`} items={tend.map((t) => ({ id: t.id, name: t.name, v: t.dog, n: t.n }))} />
      <ShareBars title="Took the home team" rate={homeRate} rateLabel={`home covered ${Math.round(homeRate * 100)}%`} items={tend.map((t) => ({ id: t.id, name: t.name, v: t.home, n: t.n }))} />
    </ChartCard>

    <ChartCard className="s12" title="By size of the spread" sub="Win % by points in the line"
      table={<HeatTable cols={bands.cols} rows={bands.rows} />}>
      <Heatmap cols={bands.cols.map((c) => `${c} pts`)} rows={bands.rows} minCol={62} thinBelow={SMALL} />
    </ChartCard>
  </>);
}

/** Horizontal share bars (0–100%) with a reference marker. */
function ShareBars({ title, items, rate, rateLabel }: { title: string; items: { id: string; name: string; v: number; n: number }[]; rate: number; rateLabel: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ font: "600 .8rem var(--body)", color: "var(--muted)", margin: "4px 0 6px" }}>{title}</div>
      <div className="bars">
        {items.map((it) => (
          <div className="b" key={it.id} title={`${it.name}: ${Math.round(it.v * 100)}% of ${it.n}`}>
            <span>{it.name}</span>
            <span className="track">
              <span style={{ position: "absolute", left: `${rate * 100}%`, top: -4, bottom: -4, borderLeft: "1px dashed var(--muted)" }} aria-hidden />
              <span className="fill" style={{ display: "block", width: `${it.v * 100}%`, ["--c" as string]: `var(--p-${it.id})` } as CSSProperties} />
            </span>
            <span className="v">{Math.round(it.v * 100)}%</span>
          </div>
        ))}
        <div className="b" aria-hidden style={{ minHeight: 0 }}><span /><span style={{ position: "relative", fontSize: ".72rem", color: "var(--faint)" }}><span style={{ position: "absolute", left: `${rate * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>{rateLabel}</span></span><span /></div>
      </div>
    </div>
  );
}

function TeamList({ title, list }: { title: string; list: (TeamRec & { lg: string })[] }) {
  return (<>
    <h5>{title}</h5>
    {list.length ? list.map((t) => (
      <div className="t" key={`${t.lg}${t.team}`}>
        <span className="n">{t.team}<small>{t.lg === "NCAA" ? "CFB" : "NFL"}</small></span>
        <span className="r">{fmtRec(t.rec)}</span>
        <span className="p">{fmtPct(t.rec)}</span>
      </div>
    )) : <div className="t"><span className="n" style={{ color: "var(--faint)", fontWeight: 400 }}>Not enough picks yet</span></div>}
  </>);
}

function Teams({ games, scope }: { games: SG[]; scope: string }) {
  const { me } = useApp();
  const people = PEOPLE.filter((p) => games.some((g) => g.picks[p.id]));
  const [who, setWho] = useState(people.some((p) => p.id === me) ? me : people[0]?.id ?? "brad");
  const id = people.some((p) => p.id === who) ? who : people[0]?.id ?? who;
  const MIN = 8;
  const tr = teamRecords(games, id, MIN);
  const most = mostPicked(games, people.map((p) => p.id), 8);
  const cov = coverLeaders(games, 10);

  return (<>
    <div className="chart-card s6">
      <div className="chart-head"><div><h3>Ride or die</h3><p>{nameOf(id)}&apos;s record backing each team · at least {MIN} picks · {scope}</p></div></div>
      <div className="pills" style={{ marginBottom: 10 }}>
        {people.map((p) => <button key={p.id} className="pill" aria-pressed={id === p.id} onClick={() => setWho(p.id)}><i className="dot" style={cvar(p.id)} /> {p.name}</button>)}
      </div>
      <div className="tlist">
        <TeamList title="Money teams" list={tr.slice(0, 5)} />
        <TeamList title="Kryptonite" list={[...tr].reverse().slice(0, 5)} />
      </div>
      <p className="hint">Most of these are under 20 picks, so treat them as bragging rights, not a system.</p>
    </div>

    <ChartCard className="s6" title="The group's favourite teams" sub="Most picked by anyone, and how those picks did"
      table={<table className="grid"><thead><tr><th>Team</th><th>Times picked</th><th>Record</th></tr></thead>
        <tbody>{most.map((m) => <tr key={m.lg + m.team}><td>{m.team}</td><td>{m.n}</td><td>{fmtRec(m.rec)} ({fmtPct(m.rec)})</td></tr>)}</tbody></table>}>
      <WinBars items={most.map((m) => ({ id: m.lg + m.team, label: m.team, sub: `picked ${m.n}× · ${m.lg === "NCAA" ? "CFB" : "NFL"}`, rec: m.rec, pct: m.pct }))} mark={BE} diverge={0.15} />
    </ChartCard>

    <div className="chart-card s12">
      <div className="chart-head"><div><h3>Cover kings and cover busts</h3><p>Every team on the sheet, whoever picked them · at least 10 games · {scope}</p></div></div>
      <div className="dash" style={{ paddingBlock: 0 }}>
        <div className="tlist s6"><TeamList title="Covered the most" list={cov.best} /></div>
        <div className="tlist s6"><TeamList title="Covered the least" list={cov.worst} /></div>
      </div>
    </div>
  </>);
}

function Fun({ games, who, scope }: P) {
  const aw = awards(games);
  const ids = who.map((p) => p.id);
  const wk = weekRecords(games, ids, 10);
  const st = who.map((p) => ({ ...p, s: streaks(games, p.id) }));
  const cons = consensus(games);
  const solo = soloRecords(games).filter((s) => n(s.rec));
  const agree = agreement(games);

  return (<>
    <div className="chart-card s12">
      <div className="chart-head"><div><h3>Trophy case</h3><p>Every title is backed by a number · min. 40 picks to qualify · {scope}</p></div></div>
      {aw.length ? (
        <div className="awards">
          {aw.map((a) => (
            <div className="award" key={a.key} style={cvar(a.who[0])}>
              <h4>{a.title}</h4>
              <div className="bl">{a.blurb}</div>
              <div className="who">{a.who.map((w) => <span key={w} className="row" style={{ gap: 6 }}><i className="dot" style={cvar(w)} />{nameOf(w)}</span>)}</div>
              <div className="stat">{a.stat}{a.key !== "heater" && a.key !== "ice" ? ` · n=${a.n}` : ""}</div>
            </div>
          ))}
        </div>
      ) : <p className="hint">Not enough picks in this view for awards.</p>}
    </div>

    <div className="chart-card s6">
      <div className="chart-head"><div><h3>Best weeks ever</h3><p>At least 10 games that week</p></div></div>
      <div className="tlist">
        {wk.slice(0, 6).map((w, i) => (
          <div className="t" key={i}><span className="n"><i className="dot" style={cvar(w.who)} />{nameOf(w.who)}<small>{w.season} {w.week}</small></span><span className="r">{fmtRec(w.rec)}</span><span className="p pos">{fmtPct(w.rec)}</span></div>
        ))}
        <h5>Weeks to forget</h5>
        {[...wk].reverse().slice(0, 6).map((w, i) => (
          <div className="t" key={i}><span className="n"><i className="dot" style={cvar(w.who)} />{nameOf(w.who)}<small>{w.season} {w.week}</small></span><span className="r">{fmtRec(w.rec)}</span><span className="p neg">{fmtPct(w.rec)}</span></div>
        ))}
      </div>
    </div>

    <div className="chart-card s6">
      <div className="chart-head"><div><h3>Streaks</h3><p>Covers or misses in a row, game by game</p></div></div>
      <table className="grid">
        <thead><tr><th>Picker</th><th>Hottest</th><th>Coldest</th><th>Now</th></tr></thead>
        <tbody>{st.map((x) => (
          <tr key={x.id}>
            <td><span className="row" style={{ gap: 6 }}><i className="dot" style={cvar(x.id)} />{x.name}</span></td>
            <td><b>{x.s.best.len}W</b> <small style={{ color: "var(--faint)" }}>{x.s.best.from}</small></td>
            <td><b>{x.s.worst.len}L</b> <small style={{ color: "var(--faint)" }}>{x.s.worst.from}</small></td>
            <td className={x.s.current?.kind === "W" ? "pos" : "neg"}>{x.s.current ? `${x.s.current.len}${x.s.current.kind}` : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>

    {cons.n > 0 && (<>
      <ChartCard className="s6" title="Does agreeing pay?" sub={`Games all four picked (${cons.n}); ${cons.n22} were 2-2 splits`}
        table={<table className="grid"><thead><tr><th>Vote</th><th>Record</th><th>Win %</th></tr></thead>
          <tbody><tr><td>4-0 unanimous</td><td>{fmtRec(cons["4-0"])}</td><td>{fmtPct(cons["4-0"])}</td></tr>
            <tr><td>3-1 majority</td><td>{fmtRec(cons["3-1"])}</td><td>{fmtPct(cons["3-1"])}</td></tr></tbody></table>}>
        <WinBars mark={BE} diverge={0.15} items={[
          { id: "u", label: "4-0", sub: `unanimous · ${n(cons["4-0"])}`, rec: cons["4-0"], pct: pct(cons["4-0"]) },
          { id: "m", label: "3-1", sub: `majority side · ${n(cons["3-1"])}`, rec: cons["3-1"], pct: pct(cons["3-1"]) },
        ]} />
        <p className="hint">Lone wolf: record when you were the only one on your side.</p>
        <WinBars mark={BE} diverge={0.15} items={solo.map((s) => ({ id: s.id, label: s.name, sub: `${n(s.rec)} solo picks${thin(s.rec)}`, rec: s.rec, pct: s.pct, color: `var(--p-${s.id})` }))} />
      </ChartCard>

      <ChartCard className="s6" title="Who thinks alike" sub="How often each pair took the same side"
        table={<table className="grid"><thead><tr><th>Pair</th><th>Same side</th><th>Games</th></tr></thead>
          <tbody>{agree.map((a) => <tr key={a.id}><td>{a.a} &amp; {a.b}</td><td>{Math.round((a.same / a.n) * 100)}%</td><td>{a.n}</td></tr>)}</tbody></table>}>
        <div className="bars">
          {agree.map((a) => (
            <div className="b" key={a.id}>
              <span>{a.a} &amp; {a.b}<span className="sub">{a.n} games</span></span>
              <span className="track"><span className="fill" style={{ display: "block", width: `${(a.same / a.n) * 100}%` }} /></span>
              <span className="v">{Math.round((a.same / a.n) * 100)}%<span className="sub">{a.same} same</span></span>
            </div>
          ))}
        </div>
      </ChartCard>
    </>)}
  </>);
}
