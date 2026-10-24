"use client";
import { weekRecap } from "@/lib/analytics";
import { cvar } from "@/lib/players";
import { fmtRec, type Rec, type Week } from "@/lib/scoring";
import { useApp } from "./store";

const tone = (r: Rec) => (r.w > r.l ? "up" : r.l > r.w ? "down" : "");

/** The finished week in one card, with a Share button for the group chat. */
export function RecapCard({ week }: { week: Week }) {
  const { season, toast } = useApp();
  const r = weekRecap(season, week.week);
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `BAKE Pool · ${r.label}`, text: r.text });
      else { await navigator.clipboard.writeText(r.text); toast("Recap copied: paste it in the group chat"); }
    } catch { /* closed the share sheet */ }
  }
  return (
    <section className="recap card">
      <div className="recap-head">
        <div><p className="eyebrow" style={{ margin: 0 }}>{r.label} recap</p>
          <div className={`recap-big ${tone(r.entry)}`}>{fmtRec(r.entry)}</div>
          <small>Entry{r.winnings ? ` · won $${r.winnings.toLocaleString()}` : ""}</small></div>
        <button className="btn" onClick={share}>Share</button>
      </div>
      <div className="recap-grid">
        <div><span>Best</span><b>{r.best.map((p) => p.name).join(", ")}</b><small>{fmtRec(r.best[0].rec)}</small></div>
        <div><span>Worst</span><b>{r.worst.map((p) => p.name).join(", ")}</b><small>{fmtRec(r.worst[0].rec)}</small></div>
        <div><span>All four agreed</span><b className={tone(r.agree)}>{fmtRec(r.agree)}</b></div>
        <div><span>Claude&apos;s tie-breaks</span><b className={tone(r.ties)}>{fmtRec(r.ties)}</b></div>
        <div><span>Eliminator</span><b>{r.elim?.team ?? "—"}</b>
          <small>{r.elim?.outcome === "survived" ? "Survived" : r.elim?.outcome === "died" ? "Life lost" : "Pending"} · {r.livesLeft} {r.livesLeft === 1 ? "life" : "lives"} left</small></div>
        <div><span>Season entry</span><b>{fmtRec(r.season)}</b></div>
      </div>
      <div className="recap-people">
        {r.people.map((p) => <span key={p.id}><i className="dot" style={cvar(p.id)} />{p.name} <b>{fmtRec(p.rec)}</b></span>)}
      </div>
    </section>
  );
}
