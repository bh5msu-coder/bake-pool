"use client";
import { useEffect, useRef, useState } from "react";
import { weekRecap } from "@/lib/analytics";
import { cvar } from "@/lib/players";
import { drawRecap, recapCardModel, RECAP_H, RECAP_W } from "@/lib/recapImage";
import { fmtRec, type Rec, type Week } from "@/lib/scoring";
import { IconShare } from "./icons";
import { useApp } from "./store";
import { Sheet } from "./ui";

const tone = (r: Rec) => (r.w > r.l ? "up" : r.l > r.w ? "down" : "");

/** The finished week in one card, with a Share button for the group chat. */
export function RecapCard({ week }: { week: Week }) {
  const { season } = useApp();
  const r = weekRecap(season, week.week);
  const [open, setOpen] = useState(false);
  return (<>
    <section className="recap card">
      <div className="recap-head">
        <div><p className="eyebrow">{r.label} recap</p>
          <div className={`recap-big ${tone(r.entry)}`}>{fmtRec(r.entry)}</div>
          <p className="recap-sub">Entry{r.winnings ? ` · won $${r.winnings.toLocaleString()}` : ""}</p></div>
        <button className="btn" onClick={() => setOpen(true)}><IconShare className="icon sm" />Share</button>
      </div>
      <div className="recap-grid">
        <div><span>Best</span><b>{r.best.map((p) => p.name).join(", ")} <small>{fmtRec(r.best[0].rec)}</small></b></div>
        <div><span>Worst</span><b>{r.worst.map((p) => p.name).join(", ")} <small>{fmtRec(r.worst[0].rec)}</small></b></div>
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
    {open && <RecapShare week={week} onClose={() => setOpen(false)} />}
  </>);
}

/** The recap as a picture, with the text version as the other choice. */
function RecapShare({ week, onClose }: { week: Week; onClose(): void }) {
  const { season, toast } = useApp();
  const r = weekRecap(season, week.week);
  const title = `BAKE Pool · ${r.label}`;
  const [img, setImg] = useState<{ url: string; file: File } | null>(null);
  const [failed, setFailed] = useState(false);
  const say = useRef(toast);
  say.current = toast;

  // Drawn as soon as the sheet opens, so the Share tap can go straight to the phone's share menu.
  useEffect(() => {
    let url = "", gone = false;
    const m = recapCardModel(weekRecap(season, week.week));
    drawRecap(m).then((blob) => {
      if (gone) return;
      url = URL.createObjectURL(blob);
      setImg({ url, file: new File([blob], m.fileName, { type: "image/png" }) });
    }).catch(() => { if (!gone) { setFailed(true); say.current("Couldn't make the image.", true); } });
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [season, week.week]);

  function save(i: { url: string; file: File }) {
    const a = document.createElement("a");
    a.href = i.url; a.download = i.file.name; a.click();
    toast("Image saved: add it to the group chat");
  }
  async function shareImage() {
    if (!img) return;
    if (!navigator.canShare?.({ files: [img.file] })) return save(img);
    try { await navigator.share({ files: [img.file], title }); }
    catch (e) { if ((e as Error).name !== "AbortError") save(img); }
  }
  async function shareText() {
    if (navigator.share) {
      try { await navigator.share({ title, text: r.text }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(r.text); toast("Recap copied: paste it in the group chat"); }
    catch { toast("Couldn't reach the clipboard.", true); }
  }

  // A picture made in the browser a moment ago: there is nothing for next/image to fetch or resize.
  // eslint-disable-next-line @next/next/no-img-element
  const picture = img && <img className="recap-preview" src={img.url} width={RECAP_W} height={RECAP_H} alt={r.text.replace(/\n/g, ". ")} />;

  return (
    <Sheet title={`Share ${r.label} recap`} onClose={onClose}>
      {picture
        || <div className="recap-preview" role="status" aria-busy={failed ? undefined : true}>{failed ? "Couldn't make the image. The text version still works." : "Making the image…"}</div>}
      <div className="stack">
        <button className="cta" disabled={!img} onClick={shareImage}>{img || failed ? "Share image" : "Making the image…"}</button>
        <button className="cta ghost" onClick={shareText}>Share text</button>
      </div>
    </Sheet>
  );
}
