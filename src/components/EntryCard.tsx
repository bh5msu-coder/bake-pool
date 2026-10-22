"use client";
// Sidebar card for this week's group entry: the pick countdown while the week is open, then the live Entry record.
import { useEffect, useState, type ReactNode } from "react";
import { phaseOf, softDeadline, timeLeft } from "@/lib/deadline";
import { ENTRY, fmtRec, groupLocked, humans, isOpen, labelOf, record } from "@/lib/scoring";
import { defaultWeekIdx, useApp } from "./store";
import { projected, useLive } from "./useLive";

/** Re-renders once a minute so countdowns stay current. */
function useMinute() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
}

const clockFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function EntryCard() {
  const { season, me, demo, tab, weekIdx, setTab, setWeekIdx } = useApp();
  useMinute();
  const idx = defaultWeekIdx(season);
  const week = season.weeks[idx];
  const { live, updatedAt } = useLive(week, demo);
  if (!week) return null;

  const ids = humans(season.players).map((p) => p.id);
  const here = tab === "week" && weekIdx === idx;
  const go = () => { setWeekIdx(idx); setTab("week"); window.scrollTo({ top: 0 }); };
  const shell = (big: ReactNode, sub: ReactNode, cls = "", foot?: ReactNode) => (
    <button className={`entry-card${here ? " here" : ""}`} onClick={go} aria-current={here ? "true" : undefined}>
      <span className="ec-lab">This week&apos;s entry</span>
      <span className="ec-wk">{labelOf(week)}</span>
      <span className={`ec-big${cls}`}>{big}</span>
      <span className="ec-sub">{sub}</span>
      {foot && <span className="ec-foot">{foot}</span>}
    </button>
  );

  if (isOpen(week)) {
    if (groupLocked(week, season.players)) return shell("Entry set", `All ${week.games.length} picks in · locked`);
    const grace = phaseOf(week.deadline, season.graceMinutes) === "grace";
    const due = week.deadline ? softDeadline(week.deadline, season.graceMinutes) : null;
    const left = grace && week.deadline ? timeLeft(week.deadline) : due ? timeLeft(due) : null;
    const lockedN = (week.locks ?? []).filter((id) => ids.includes(id)).length;
    const mine = week.games.filter((g) => g.picks[me]).length;
    return shell(
      left ?? "Open",
      grace ? "grace period · locks in" : left ? "until picks are due" : "no deadline set",
      grace ? " late" : "",
      `You ${mine}/${week.games.length} · ${lockedN} of ${ids.length} locked`,
    );
  }

  const proj = projected(week, live);
  const finals = week.games.filter((g) => g.result || live.get(g.num)?.state === "post").length;
  const playing = week.games.filter((g) => !g.result && live.get(g.num)?.state === "in").length;
  const done = week.games.length > 0 && week.games.every((g) => g.result);
  const rec = fmtRec(record(proj, ENTRY, ids));
  const sub = done ? "Final"
    : playing ? <><span className="live-dot" />{playing} live · {finals} final</>
    : finals ? `${finals} of ${week.games.length} final`
    : "Locked · games to come";
  const foot = done
    ? week.winnings > 0 ? `Won $${week.winnings}` : undefined
    : updatedAt ? `Updated ${clockFmt.format(updatedAt)}` : undefined;
  return shell(rec, sub, "", foot);
}
