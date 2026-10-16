"use client";
import { useMemo, useState } from "react";
import { band, BANDS, ENTRY, shortLabel, fmtPct, fmtRec, grade, humans, pickOf, record, side, split, type Game, type Week } from "@/lib/scoring";
import { Header, Sheet } from "./ui";
import { GameSheet } from "./Week";
import { emptyFilter, useApp, type ExploreFilter } from "./store";

type SetKey = "weeks" | "league" | "band" | "side" | "split";
const FACETS: { k: SetKey; lab: string; values(weeks: Week[]): (string | number)[] }[] = [
  { k: "weeks", lab: "Week", values: (ws) => ws.map((w) => w.week) },
  { k: "league", lab: "League", values: () => ["NFL", "NCAA"] },
  { k: "band", lab: "Spread", values: () => BANDS },
  { k: "side", lab: "Side", values: () => ["Fav", "Dog"] },
  { k: "split", lab: "Split", values: () => ["4-0", "3-1", "2-2"] },
];

export function ExploreTab() {
  const { season, filter: F, setFilter } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const [facet, setFacet] = useState<SetKey | "picker" | null>(null);
  const [detail, setDetail] = useState<{ g: Game; w: Week } | null>(null);

  const all = useMemo(() => season.weeks.flatMap((w) => w.games.map((g) => ({ g, w }))), [season]);
  const rows = all.filter(({ g, w }) => {
    if (F.weeks.size && !F.weeks.has(w.week)) return false;
    if (F.league.size && !F.league.has(g.league)) return false;
    if (F.band.size && !F.band.has(band(g.spread))) return false;
    if (F.side.size && !F.side.has(side(g, pickOf(g, F.picker, ids)) ?? "")) return false;
    if (F.split.size && !F.split.has(split(g, ids) ?? "")) return false;
    if (F.result !== "any" && grade(pickOf(g, F.picker, ids), g.result) !== F.result) return false;
    return true;
  });
  const games = rows.map((r) => r.g);
  const pickerName = F.picker === ENTRY ? "Entry" : season.players.find((p) => p.id === F.picker)?.name ?? F.picker;
  const active = FACETS.filter((f) => F[f.k].size).length + (F.result !== "any" ? 1 : 0);
  const cols = [...season.players.map((p) => ({ id: p.id, i: p.initial })), { id: ENTRY, i: "N" }];

  const show = (k: SetKey, v: string | number) => {
    const w = k === "weeks" ? season.weeks.find((x) => x.week === v) : undefined;
    return w ? shortLabel(w) : String(v);
  };
  const toggle = (k: SetKey, v: string | number) => {
    const next = new Set(F[k] as Set<string | number>);
    if (next.has(v)) next.delete(v); else next.add(v);
    setFilter({ ...F, [k]: next } as ExploreFilter);
  };
  const live = detail && season.weeks.find((w) => w.week === detail.w.week);

  return (<>
    <Header title="Explore" sub={`${all.length} GAMES ON FILE`}
      right={active ? <button className="link" onClick={() => setFilter(emptyFilter(F.picker))}>CLEAR</button> : undefined} />
    <main className="wrap">
      <div className="rail" style={{ paddingBlock: 10 }}>
        <button className="pill" aria-pressed onClick={() => setFacet("picker")}>
          {pickerName}{F.result !== "any" && ` · ${F.result === "W" ? "wins" : "losses"}`}
        </button>
        {FACETS.map((f) => (
          <button key={f.k} className="pill" aria-pressed={F[f.k].size > 0} onClick={() => setFacet(f.k)}>
            {f.lab}{F[f.k].size > 0 && <small>{[...F[f.k]].map((v) => show(f.k, v)).join(", ")}</small>}
          </button>
        ))}
      </div>
      <div className="tally">
        <span>{games.length} games</span>
        <span>{pickerName} {fmtRec(record(games, F.picker, ids))} {fmtPct(record(games, F.picker, ids))}</span>
        {F.picker !== ENTRY && <span className="q">Entry {fmtRec(record(games, ENTRY, ids))}</span>}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>&quot;Side&quot; and wins/losses follow {pickerName}&apos;s pick.</p>
      <div className="cells" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)`, marginTop: 10 }} aria-hidden>
        {cols.map((c) => <span key={c.id} className="cell" style={{ background: "none" }}>{c.id === ENTRY ? "ENTRY" : c.i}</span>)}
      </div>
      <div className="list">
        {rows.map(({ g, w }) => (
          <button key={`${w.week}-${g.num}`} className="xg" onClick={() => setDetail({ g, w })}>
            <span className="l1"><span className="num">{shortLabel(w)} G{String(g.num).padStart(2, "0")}</span><span>{g.league}</span><span>{g.line}</span>
              {split(g, ids) && <span className={`tag${split(g, ids) === "2-2" ? " signal" : ""}`}>{split(g, ids)}</span>}</span>
            <span className="mu" style={{ display: "block" }}>{g.away} at {g.home}</span>
            <span className="cells" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
              {cols.map((c) => {
                const v = grade(pickOf(g, c.id, ids), g.result);
                return <span key={c.id} className={`cell ${v ?? ""}`}>{v ?? (pickOf(g, c.id, ids) ? c.i : "·")}</span>;
              })}
            </span>
          </button>
        ))}
        {!rows.length && <div className="empty"><b>No games match</b>Loosen a filter.</div>}
      </div>
    </main>

    {facet === "picker" && (
      <Sheet title="Whose picks" onClose={() => setFacet(null)}>
        <div className="pills">
          {[...season.players.map((p) => [p.id, p.name]), [ENTRY, "Entry"]].map(([id, n]) => (
            <button key={id} className="pill" aria-pressed={F.picker === id} onClick={() => setFilter({ ...F, picker: id })}>{n}</button>
          ))}
        </div>
        <p className="eyebrow" style={{ marginTop: 18 }}>Result</p>
        <div className="pills">
          {(["any", "W", "L"] as const).map((r) => (
            <button key={r} className="pill" aria-pressed={F.result === r} onClick={() => setFilter({ ...F, result: r })}>
              {r === "any" ? "Any" : r === "W" ? "Wins" : "Losses"}
            </button>
          ))}
        </div>
      </Sheet>
    )}
    {facet && facet !== "picker" && (() => {
      const f = FACETS.find((x) => x.k === facet)!;
      return (
        <Sheet title={f.lab} onClose={() => setFacet(null)}
          action={F[f.k].size ? <button className="link" onClick={() => setFilter({ ...F, [f.k]: new Set() } as ExploreFilter)}>CLEAR</button> : undefined}>
          <div className="pills">
            {f.values(season.weeks).map((v) => (
              <button key={v} className="pill" aria-pressed={(F[f.k] as Set<string | number>).has(v)} onClick={() => toggle(f.k, v)}>{show(f.k, v)}</button>
            ))}
          </div>
        </Sheet>
      );
    })()}
    {live && detail && <GameSheet game={live.games.find((g) => g.num === detail.g.num)!} week={live} onClose={() => setDetail(null)} />}
  </>);
}
