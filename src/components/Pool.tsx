"use client";
import { useState } from "react";
import {
  band, BANDS, ENTRY, shortLabel, fmtPct, fmtRec, headToHead, humans, MAJORITY, money, pct, pickOf, record, side, soloPicker, split,
  type Game, type Rec,
} from "@/lib/scoring";
import { Header } from "./ui";
import { emptyFilter, useApp, type ExploreFilter } from "./store";

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function PoolTab() {
  const { season, me, setTab, setFilter } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const done = season.weeks.flatMap((w) => w.games).filter((g) => g.result);
  const gradedWeeks = season.weeks.filter((w) => w.games.some((g) => g.result));
  const lastWeek = gradedWeeks.at(-1);
  const [who, setWho] = useState(me);
  const m = money(season);

  const standings = season.players
    .map((p) => ({ p, r: record(done, p.id, ids), wk: lastWeek ? record(lastWeek.games, p.id, ids) : null }))
    .sort((a, b) => (pct(b.r) ?? 0) - (pct(a.r) ?? 0) || b.r.w - a.r.w);

  const open = (f: Partial<ExploreFilter>) => {
    setFilter({ ...emptyFilter(who), ...f, picker: who });
    setTab("explore");
    window.scrollTo({ top: 0 });
  };

  if (!done.length) {
    return (<>
      <Header title="Pool" sub="SEASON STANDINGS" />
      <main className="wrap"><div className="empty"><b>No results yet</b>Standings appear once the first games are graded.</div></main>
    </>);
  }

  const slices = diagnostics(done, who, ids);
  const whoName = season.players.find((p) => p.id === who)?.name ?? who;

  return (<>
    <Header title="Pool" sub={`${done.length} GAMES GRADED · ${gradedWeeks.length} WEEKS`} />
    <main className="wrap">
      <section>
        <p className="eyebrow">Season standings</p>
        <div className="list">
          {standings.map(({ p, r, wk }, i) => (
            <div key={p.id} className={`st${p.id === me ? " me" : ""}`}>
              <span className="rk num">{i + 1}</span>
              <span className="nm">{p.name}{wk && <small>{shortLabel(lastWeek!)}: {fmtRec(wk)}</small>}</span>
              <span className="rc num">{fmtRec(r)}</span>
              <span className="pc num">{fmtPct(r)}</span>
            </div>
          ))}
          {([[ENTRY, "Entry", "what was submitted"], [MAJORITY, "Majority", "only games with 3+ agreeing"]] as const).map(([id, n, sub]) => {
            const r = record(done, id, ids);
            return (
              <div key={id} className="st bench">
                <span className="rk" /><span className="nm">{n}<small>{sub}</small></span>
                <span className="rc num">{fmtRec(r)}</span><span className="pc num">{fmtPct(r)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="eyebrow">Money · season</p>
        <div className="money">
          <div><span>PAID IN</span><b className="num">{usd(m.fees)}</b></div>
          <div><span>WON</span><b className="num pos">{usd(m.won)}</b></div>
          <div><span>NET · EACH</span><b className={`num ${m.net < 0 ? "neg" : "pos"}`}>{usd(m.each)}</b></div>
        </div>
        <p className="hint">
          {usd(m.weekly)} season entry{m.buybacks ? ` + ${usd(m.buybacks)} eliminator buy-back${season.elimBuybacks > 1 ? "s" : ""}` : ""}
          {season.ledger.map((e) => ` ${e.amount < 0 ? "+" : "−"} ${usd(Math.abs(e.amount))} ${e.label}`).join("")}
          {" "}· group net {usd(m.net)}.
        </p>
      </section>

      <section>
        <p className="eyebrow">Week by week</p>
        <div className="tablewrap">
          <table className="grid">
            <thead><tr><th>WK</th>{season.players.map((p) => <th key={p.id}>{p.initial}</th>)}<th>ENTRY</th><th>$</th></tr></thead>
            <tbody>
              {gradedWeeks.map((w) => {
                const recs = season.players.map((p) => record(w.games, p.id, ids));
                const best = Math.max(...recs.map((r) => r.w));
                return (
                  <tr key={w.week}>
                    <td>{shortLabel(w)}</td>
                    {recs.map((r, i) => <td key={i} className={r.w === best ? "best" : ""}>{r.w}</td>)}
                    <td>{fmtRec(record(w.games, ENTRY, ids))}</td>
                    <td className={w.winnings ? "pos" : ""}>{w.winnings ? usd(w.winnings) : "·"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">Wins per week out of the games graded. Green marks the week&apos;s best.</p>
      </section>

      <section>
        <div className="row" style={{ marginBottom: 6 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Breakdown for</p>
          <div className="rail" style={{ marginLeft: "auto" }}>
            {season.players.map((p) => <button key={p.id} className="pill" aria-pressed={who === p.id} onClick={() => setWho(p.id)}>{p.name}</button>)}
          </div>
        </div>
        <div className="list">
          {slices.map((s) => (
            <button key={s.k} className="slice" onClick={() => s.f && open(s.f)} disabled={!s.f}>
              <span className="k">{s.k}<small>{s.sub}</small></span>
              <span className="r num">{fmtRec(s.r)} &nbsp;{fmtPct(s.r)}</span>
              <span className="go">{s.f ? "›" : ""}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">{whoName} head to head · disagreements only</p>
        <div className="list">
          {season.players.filter((p) => p.id !== who).map((p) => {
            const h = headToHead(done, who, p.id, ids);
            return (
              <div key={p.id} className="st">
                <span className="rk" />
                <span className="nm">vs {p.name}<small>{h.games} games apart</small></span>
                <span className="rc num">{h.a}-{h.b}</span>
                <span className="pc num">{h.games ? (h.a > h.b ? "AHEAD" : h.a < h.b ? "BEHIND" : "EVEN") : "—"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  </>);
}

function diagnostics(games: Game[], who: string, ids: string[]) {
  const rec = (pred: (g: Game) => boolean) => record(games.filter(pred), who, ids);
  const picked = (g: Game) => pickOf(g, who, ids);
  const out: { k: string; sub: string; r: Rec; f?: Partial<ExploreFilter> }[] = [
    { k: "Underdogs", sub: "when taking the points", r: rec((g) => side(g, picked(g)) === "Dog"), f: { side: new Set(["Dog"]) } },
    { k: "Favourites", sub: "when laying the points", r: rec((g) => side(g, picked(g)) === "Fav"), f: { side: new Set(["Fav"]) } },
    { k: "2-2 splits", sub: "no majority, Claude decides the entry", r: rec((g) => split(g, ids) === "2-2"), f: { split: new Set(["2-2"]) } },
    { k: "NFL", sub: "pro games", r: rec((g) => g.league === "NFL"), f: { league: new Set(["NFL"]) } },
    { k: "College", sub: "NCAA games", r: rec((g) => g.league === "NCAA"), f: { league: new Set(["NCAA"]) } },
    ...BANDS.map((b) => ({ k: `Spread ${b}`, sub: b === ">14" ? "big lines" : b === "0-3" ? "coin flips" : "points", r: rec((g) => band(g.spread) === b), f: { band: new Set([b]) } })),
  ];
  if (ids.includes(who)) out.push({ k: "Solo picks", sub: "alone against the other three", r: rec((g) => soloPicker(g, ids) === who) });
  return out;
}
