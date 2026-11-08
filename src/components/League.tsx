"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { LeagueView } from "@/lib/leagueData";
import { ChartCard, LineChart } from "./charts";
import { Header } from "./ui";
import { useApp } from "./store";

type Sub = "overview" | "board" | "money";
type Row = LeagueView["rows"][number];

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const pct = (p: number) => (p >= 0.995 ? ">99%" : p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
const rankText = (r: { rank: number; tied: boolean }) => `${r.tied ? "T" : ""}${r.rank}`;
const periodShort = (p: string) => (/^\d+$/.test(p) ? `W${p}` : p);

let memo: { at: number; data: LeagueView } | null = null;

function useLeague(demo: boolean) {
  const [data, setData] = useState<LeagueView | null>(memo?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(demo ? "/api/league?demo" : "/api/league");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
        memo = { at: Date.now(), data: json };
        if (!stop) { setData(json); setError(null); }
      } catch (e) { if (!stop) setError((e as Error).message); }
    };
    if (!memo || Date.now() - memo.at > 5 * 60_000) void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), 10 * 60_000);
    return () => { stop = true; window.clearInterval(t); };
  }, [demo]);
  return { data, error };
}

export function LeagueTab() {
  const { demo } = useApp();
  const { data, error } = useLeague(demo);
  const [sub, setSub] = useState<Sub>("overview");

  if (!data) {
    return (<>
      <Header title="The Pool" sub="League standings" />
      <main className="wrap"><div className="empty">
        {error ? <><b>Couldn&apos;t load The Pool</b>{error}</> : <><b>Loading the league…</b>Reading The Pool&apos;s sheet and running the season simulation.</>}
      </div></main>
    </>);
  }

  const us = data.rows.find((r) => r.entry === data.entry);
  const updated = new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (<>
    <Header title="The Pool" sub={`${data.entries} entries · through ${data.current ? periodShort(data.current) : "—"} · updated ${updated}`} />
    <main className="wrap">
      <div className="subtabs" role="tablist" aria-label="League views">
        {([["overview", "Overview"], ["board", "Leaderboard"], ["money", "Money & Elim"]] as [Sub, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      <div className="dash">
        {sub === "overview" && <Overview data={data} us={us} />}
        {sub === "board" && <Board data={data} />}
        {sub === "money" && <MoneyElim data={data} />}
      </div>
    </main>
  </>);
}

function Overview({ data, us }: { data: LeagueView; us?: Row }) {
  if (!us) return <div className="empty"><b>{data.entry} isn&apos;t on The Pool&apos;s championship sheet</b></div>;
  const behindLead = data.champ.leaderTotal - us.total;
  const behindCut = data.champ.cutoff - us.total;
  const o = us.odds;
  const top = [...data.rows].sort((a, b) => b.odds.pMoney - a.odds.pMoney);
  const shown = top.slice(0, 8);
  if (!shown.some((r) => r.entry === data.entry)) shown.push(us);
  // Zoom the weekly-finishes scale to the range complete weeks actually use (an in-progress week clamps).
  const full = data.weeks.filter((w) => w.complete);
  const basis = full.length ? full : data.weeks;
  const lo = Math.max(0, Math.min(...basis.map((w) => w.field.min)) - 1);
  const hi = Math.max(lo + 2, ...basis.map((w) => w.field.max + 1));
  const gap = {
    labels: data.race.map((r) => periodShort(r.period)),
    series: [
      { id: "leader", name: "vs leader", values: data.race.map((r) => r.us - r.leader) },
      { id: "cutoff", name: "vs 4th place", values: data.race.map((r) => r.us - r.cutoff) },
    ],
  };

  return (<>
    <div className="kpis">
      <div className="kpi hero"><div className="l">{data.entry} championship rank</div><div className="v">{rankText(us)}<span style={{ fontSize: ".45em", color: "var(--faint)", fontWeight: 600 }}> of {data.entries}</span></div>
        <div className="d">{us.total} wins{us.move ? ` · ${us.move > 0 ? "▲" : "▼"} ${Math.abs(us.move)} this week` : ""}</div></div>
      <div className="kpi"><div className="l">Behind the leader</div><div className="v">{behindLead > 0 ? behindLead : "Leading"}</div><div className="d">leader has {data.champ.leaderTotal}</div></div>
      <div className="kpi"><div className="l">Behind 4th (paid)</div><div className={`v ${behindCut <= 0 ? "pos" : ""}`}>{behindCut > 0 ? behindCut : "In the money"}</div><div className="d">money line is {data.champ.cutoff} wins</div></div>
      <div className="kpi"><div className="l">Won so far</div><div className="v">{usd(us.won)}</div><div className="d">weekly + championship</div></div>
      <div className="kpi"><div className="l">Elimination</div><div className="v">{us.elim ? (us.elim.alive ? "Alive" : "Out") : "—"}</div><div className="d">{us.elim ? `${us.elim.losses} loss${us.elim.losses === 1 ? "" : "es"} · ${data.elim.alive} of ${data.elim.entries} alive` : ""}</div></div>
    </div>

    <ChartCard className="s5" title="Chance to finish in the money" sub={`Championship pays the top ${data.champ.places.length}: ${data.champ.places.map(usd).join(" / ")}`}
      table={<table className="grid"><thead><tr><th>Entry</th><th>Now</th><th>In the money</th><th>Win it</th><th>Exp. $</th><th>Final wins</th></tr></thead>
        <tbody>{top.map((r) => <tr key={r.entry} style={r.entry === data.entry ? { fontWeight: 700 } : undefined}><td>{r.entry}</td><td>{rankText(r)}</td><td>{pct(r.odds.pMoney)}</td><td>{pct(r.odds.pFirst)}</td><td>{usd(r.odds.expPayout)}</td><td>{r.odds.p10}–{r.odds.p90}</td></tr>)}</tbody></table>}>
      <div className="row" style={{ alignItems: "flex-end", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
        <div><div style={{ font: "800 3rem/1 var(--body)", letterSpacing: "-.02em" }}>{pct(o.pMoney)}</div><div className="lab" style={{ color: "var(--muted)", fontSize: ".85rem" }}>{data.entry} finishes top {data.champ.places.length}</div></div>
        <div><div style={{ font: "700 1.5rem/1 var(--body)" }}>{pct(o.pFirst)}</div><div style={{ color: "var(--muted)", fontSize: ".8rem" }}>wins it all</div></div>
        <div><div style={{ font: "700 1.5rem/1 var(--body)" }}>{usd(o.expPayout)}</div><div style={{ color: "var(--muted)", fontSize: ".8rem" }}>expected payout</div></div>
        <div><div style={{ font: "700 1.5rem/1 var(--body)" }}>{o.p50}</div><div style={{ color: "var(--muted)", fontSize: ".8rem" }}>projected wins ({o.p10}–{o.p90})</div></div>
      </div>
      <div className="bars">
        {shown.map((r) => (
          <div className="b" key={r.entry} style={r.entry === data.entry ? { fontWeight: 700 } : undefined}>
            <span>{r.entry}<span className="sub">{rankText(r)} · {r.total} W</span></span>
            <span className="track"><span className="fill" style={{ display: "block", width: `${r.odds.pMoney * 100}%`, ["--c" as string]: r.entry === data.entry ? "var(--ink)" : "var(--accent)" } as CSSProperties} /></span>
            <span className="v">{pct(r.odds.pMoney)}<span className="sub">win {pct(r.odds.pFirst)}</span></span>
          </div>
        ))}
      </div>
      <p className="hint">5,000 simulated seasons over the {data.games.remaining} games left. Each entry&apos;s true pick rate is uncertain:
        it&apos;s drawn from its record so far blended with the field average, then the remaining games are played out. Ties split the payouts, as on the sheet.</p>
    </ChartCard>

    <ChartCard className="s7" title="Chasing the money" sub={`${data.entry}'s wins minus the leader's and minus 4th place, after each week · above zero = ahead`}
      table={<table className="grid"><thead><tr><th>Week</th><th>{data.entry}</th><th>Leader</th><th>4th place</th></tr></thead>
        <tbody>{data.race.map((r) => <tr key={r.period}><td>{periodShort(r.period)}</td><td>{r.us}</td><td>{r.leader}</td><td>{r.cutoff}</td></tr>)}</tbody></table>}>
      <LineChart labels={gap.labels} series={gap.series} highlight={["leader", "cutoff"]} />
    </ChartCard>

    <ChartCard className="s12" title="Weekly finishes" sub={`Each week's spread of wins across all ${data.entries} entries; the dot is ${data.entry}`}
      table={<table className="grid"><thead><tr><th>Week</th><th>{data.entry}</th><th>Rank</th><th>Worst</th><th>Middle</th><th>Best</th><th>Won</th></tr></thead>
        <tbody>{data.weeks.map((w) => <tr key={w.period}><td>{w.label}</td><td>{w.us ?? "—"}</td><td>{w.rank ? rankText({ rank: w.rank, tied: w.tied }) : "—"}</td><td>{w.field.min}</td><td>{w.field.median}</td><td>{w.field.max}</td><td>{w.won ? usd(w.won) : "·"}</td></tr>)}</tbody></table>}>
      <div className="legend"><span className="q" style={{ color: "var(--faint)" }}>Scale {lo}–{hi} wins</span><span><i className="key sq" style={{ "--c": "var(--rule)" } as CSSProperties} />Worst to best</span><span><i className="key sq" style={{ "--c": "var(--axis)" } as CSSProperties} />Middle half</span><span><i className="key sq" style={{ "--c": "var(--ink)", borderRadius: 6 } as CSSProperties} />{data.entry}</span></div>
      <div className="finishes">
        {data.weeks.map((w) => {
          const x = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
          return (
            <div className="fw" key={w.period}>
              <span className="fl">{w.label}{!w.complete && <span className="sub">in progress</span>}</span>
              <span className="ft" title={`${w.label}: worst ${w.field.min}, middle ${w.field.median}, best ${w.field.max}${w.us !== null ? `; ${data.entry} ${w.us}` : ""}`}>
                <i className="range" style={{ left: x(w.field.min), width: `calc(${x(w.field.max - w.field.min)})` }} />
                <i className="iqr" style={{ left: x(w.field.p25), width: `calc(${x(w.field.p75 - w.field.p25)})` }} />
                <i className="med" style={{ left: x(w.field.median) }} />
                {w.us !== null && <i className="us" style={{ left: x(w.us) }} />}
              </span>
              <span className="fv">{w.us ?? "—"}<span className="sub">{w.rank ? `${rankText({ rank: w.rank, tied: w.tied })} of ${w.field.n}` : ""}{w.won ? ` · ${usd(w.won)}` : ""}</span></span>
            </div>
          );
        })}
      </div>
    </ChartCard>
  </>);
}

function Board({ data }: { data: LeagueView }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const periods = data.weeks.map((w) => w.period);
  const val = (r: Row, k: string): number =>
    k === "rank" ? r.rank : k === "total" ? r.total : k === "won" ? r.won : k === "money" ? r.odds.pMoney : k === "move" ? r.move : r.weekly[k] ?? -1;
  const rows = [...data.rows].sort((a, b) => (val(a, sort.key) - val(b, sort.key)) * sort.dir || a.rank - b.rank);
  const th = (k: string, label: string, defDir: 1 | -1 = -1) => (
    <th key={k} className="sortable" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : defDir }))}
      aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      {label}{sort.key === k ? (sort.dir === 1 ? " ▴" : " ▾") : ""}
    </th>
  );
  const us = data.rows.find((r) => r.entry === data.entry);
  const line = (r: Row, pinned = false) => (
    <tr key={(pinned ? "pin-" : "") + r.entry} className={r.entry === data.entry ? "us-row" : ""}>
      <td className="sticky-1">{rankText(r)}</td>
      <td className="sticky-2">{r.entry}</td>
      <td><b>{r.total}</b></td>
      <td>{data.champ.leaderTotal - r.total || "—"}</td>
      <td className={r.move > 0 ? "pos" : r.move < 0 ? "neg" : ""}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : "·"}</td>
      {periods.map((p) => <td key={p}>{r.weekly[p] ?? "·"}</td>)}
      <td>{r.won ? usd(r.won) : "·"}</td>
      <td>{pct(r.odds.pMoney)}</td>
    </tr>
  );
  return (
    <div className="chart-card s12">
      <div className="chart-head"><div><h3>Championship leaderboard</h3><p>Tap a column to sort. {data.entry} is pinned at the top and highlighted.</p></div></div>
      <div className="tablewrap">
        <table className="grid board">
          <thead><tr>
            {th("rank", "Rank", 1)}<th className="sticky-2">Entry</th>{th("total", "Wins")}<th>Back</th>{th("move", "Δ")}
            {periods.map((p) => th(p, periodShort(p)))}{th("won", "Won")}{th("money", "Money %")}
          </tr></thead>
          <tbody>
            {us && line(us, true)}
            {rows.map((r) => line(r))}
          </tbody>
        </table>
      </div>
      <p className="hint">Δ is the change in rank this week. Money % is the simulated chance of finishing in the top {data.champ.places.length}.</p>
    </div>
  );
}

function MoneyElim({ data }: { data: LeagueView }) {
  const max = Math.max(1, ...data.money.map((m) => m.total));
  const e = data.elim;
  return (<>
    <div className="chart-card s7">
      <div className="chart-head"><div><h3>Money leaders</h3><p>Everything won so far: weekly payouts, elimination and championship</p></div></div>
      <div className="bars">
        {data.money.map((m) => (
          <div className="b" key={m.entry} style={m.entry === data.entry ? { fontWeight: 700 } : undefined}>
            <span>{m.entry}</span>
            <span className="track"><span className="fill" style={{ display: "block", width: `${(m.total / max) * 100}%`, ["--c" as string]: m.entry === data.entry ? "var(--ink)" : "var(--accent)" } as CSSProperties} /></span>
            <span className="v">{usd(m.total)}</span>
          </div>
        ))}
        {!data.money.some((m) => m.entry === data.entry) && <p className="hint">{data.entry} hasn&apos;t cashed yet.</p>}
      </div>
    </div>
    <div className="chart-card s5">
      <div className="chart-head"><div><h3>Elimination</h3><p>Pot {usd(e.pot)} · pays {e.places.map(usd).join(" / ")}</p></div></div>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="kpi"><div className="l">Still alive</div><div className="v">{e.alive}</div><div className="d">of {e.entries} entries</div></div>
        <div className="kpi"><div className="l">Perfect</div><div className="v">{e.noLoss}</div><div className="d">no losses</div></div>
        <div className="kpi"><div className="l">One loss</div><div className="v">{e.oneLoss}</div><div className="d">one more ends it</div></div>
        <div className="kpi"><div className="l">Eliminated</div><div className="v">{e.eliminated}</div><div className="d">&nbsp;</div></div>
      </div>
      {e.us && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>{data.entry}: {e.us.alive ? "alive" : "eliminated"}</b> · {e.us.losses} loss{e.us.losses === 1 ? "" : "es"}{e.us.rebuy ? " · bought back" : ""}
          <div className="burned" style={{ marginTop: 8 }}>{e.us.picks.filter(Boolean).map((p, i) => <span key={i} style={{ textDecoration: "none" }}>W{i + 1} {p}</span>)}</div>
        </div>
      )}
    </div>
  </>);
}
