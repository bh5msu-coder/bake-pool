"use client";
// This week's entry, line by line: the team on the entry, how it got there (4-0, 3-1, Claude's tie-break or Brad's
// override), who's on it, and how it's doing.
import { chipClass, colorOf } from "@/lib/players";
import { ENTRY, entryLines, entryPick, fmtRec, grade, humans, labelOf, majority, record, revealed, split, type Week } from "@/lib/scoring";
import { spreadFor } from "@/lib/teams";
import { useApp } from "./store";
import { Sheet } from "./ui";
import { projected, type LiveMap } from "./useLive";

export function EntrySheet({ week, live, onClose }: { week: Week; live: LiveMap; onClose(): void }) {
  const { season, isAdmin, toast } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const shown = revealed(week, season.players);
  const proj = projected(week, live);

  const rows = week.games.map((g) => {
    const pick = entryPick(g, ids);
    const sp = split(g, ids);
    // How the line got there: Brad's override, a 4-0 or 3-1 majority, or Claude (a 2-2 split, or no majority because
    // someone didn't pick).
    const how = !pick ? null : g.entryOverride ? "Override" : majority(g, ids) ? "Majority" : "Claude";
    const label = how === "Majority" ? (sp ?? "Majority") : how === "Claude" && sp ? `${sp} · Claude` : how;
    const backers = season.players.filter((p) => g.picks[p.id] === pick && (p.kind === "human" || how === "Claude"));
    const l = live.get(g.num);
    const res = grade(pick, g.result);
    const liveSide = !g.result && l && l.state !== "pre" ? l.covering : null;
    return { g, pick, how, label, backers, res, liveSide, final: !!g.result || l?.state === "post" };
  });
  const n = (k: string) => rows.filter((r) => (k === "4-0" || k === "3-1" ? r.how === "Majority" && split(r.g, ids) === k : r.how === k)).length;
  const picked = rows.filter((r) => r.pick).length;
  const rec = record(proj, ENTRY, ids);
  const hasRec = rec.w + rec.l + rec.p > 0;

  const copy = async () => {
    try { await navigator.clipboard.writeText(entryLines(week, ids).text); toast(`Copied ${picked} lines`); }
    catch { toast("Couldn't reach the clipboard.", true); }
  };

  return (
    <Sheet title={`${labelOf(week)} entry`} onClose={onClose}
      action={isAdmin && shown && picked > 0 ? <button className="link" onClick={copy}>Copy</button> : undefined}>
      {!shown ? (
        <div className="empty"><b>Hidden until everyone locks</b>
          The entry is built from everyone&apos;s picks, so it shows once all four have locked or the {week.deadline ? "2:30 PM" : ""} lock passes.
          {(week.locks?.length ?? 0) > 0 && ` ${week.locks!.length} of ${ids.length} have locked.`}
        </div>
      ) : (<>
        <p className="esum">
          <b>{picked} of {week.games.length} lines</b>
          {hasRec && <span className="tag accent">{fmtRec(rec)}</span>}
          <span className="tag">4-0 · {n("4-0")}</span>
          <span className="tag">3-1 · {n("3-1")}</span>
          <span className="tag">Claude · {n("Claude")}</span>
          {n("Override") > 0 && <span className="tag signal">Override · {n("Override")}</span>}
        </p>
        <div className="list">
          {rows.map(({ g, pick, label, backers, res, liveSide, final }) => (
            <div key={g.id ?? g.num} className={`erow${res === "W" ? " w" : res === "L" ? " l" : ""}`}>
              <span className="k">
                {pick ? <><b>{pick}</b> <span className="ln">{spreadFor(pick, g.fav, g.spread)}</span></> : <b className="none">No pick yet</b>}
                <small>G{g.num} · {g.away} at {g.home}{label ? ` · ${label}` : ""}</small>
              </span>
              <span className="who">
                {backers.map((p) => (
                  <span key={p.id} className={`chip${chipClass(p.id)}`} style={{ background: colorOf(p.id) }} title={p.name}>{p.initial}</span>
                ))}
              </span>
              <span className="r">
                {res ? <span className={`tag ${res === "W" ? "win" : res === "L" ? "loss" : "signal"}`}>{res === "P" ? "Push" : res === "W" ? "Win" : "Loss"}</span>
                  : liveSide ? <span className={`tag ${liveSide === pick ? "win" : liveSide === "PUSH" ? "signal" : "loss"}`}>
                      {liveSide === "PUSH" ? "Push" : liveSide === pick ? "Covering" : "Behind"}{final ? "" : " ·"}{final ? "" : <span className="live-dot" style={{ marginLeft: 4 }} />}
                    </span>
                  : null}
              </span>
            </div>
          ))}
        </div>
        <p className="hint">Majority (3 of 4) makes the entry; Claude breaks 2-2 splits; Brad can override a line.</p>
      </>)}
    </Sheet>
  );
}
