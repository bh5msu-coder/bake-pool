"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { colorOf } from "@/lib/players";
import { ENTRY, elimSummary, fmtRec, humans, money, record } from "@/lib/scoring";
import { EntryCard } from "./EntryCard";
import { IconElim, IconLeague, IconPool, IconWeek, IconStats } from "./icons";
import { useApp, type Tab } from "./store";

export function Header({ title, sub, right, strip, onTitle, score }: {
  title: string; sub?: string; right?: ReactNode; strip?: ReactNode; onTitle?(): void; score?: ReactNode;
}) {
  const { season, me, setMenu, online, live } = useApp();
  const p = season.players.find((x) => x.id === me);
  return (
    <header className="top">
      <div className="wrap bar">
        <h1>{onTitle ? <button className="titlebtn" onClick={onTitle} aria-label={`${title}, choose week`}>{title}</button> : title}{sub && <small>{sub}</small>}</h1>
        {score}
        {live && online && <span className="conn" title="Live updates on"><i />Live</span>}
        {right}
        <button className="avatar" style={{ "--who": colorOf(me) } as CSSProperties} onClick={() => setMenu(true)} aria-label="Menu">
          {p?.initial ?? "?"}
        </button>
      </div>
      {strip}
      {!online && <div className="offline" role="status">Offline · showing the last update. Picks can&apos;t be saved right now.</div>}
    </header>
  );
}

/** Previous / next week arrows, shared by the Week and Eliminator screens. */
export function WeekNav() {
  const { season, weekIdx, setWeekIdx } = useApp();
  return (
    <div className="wknav">
      <button className="iconbtn" disabled={weekIdx <= 0} onClick={() => setWeekIdx(weekIdx - 1)} aria-label="Previous week">‹</button>
      <button className="iconbtn" disabled={weekIdx >= season.weeks.length - 1} onClick={() => setWeekIdx(weekIdx + 1)} aria-label="Next week">›</button>
    </div>
  );
}

type SheetState = { sheet?: number } | null;

export function Sheet({ title, onClose, children, action }: { title: string; onClose(): void; children: ReactNode; action?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // An open sheet is a step in the phone's history, so the back swipe closes it instead of leaving the app.
  const depth = useRef(0);
  const leaving = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(leaving.current);
    if (!depth.current) {
      depth.current = ((window.history.state as SheetState)?.sheet ?? 0) + 1;
      window.history.pushState({ sheet: depth.current }, "");
    }
    const onPop = () => { if (((window.history.state as SheetState)?.sheet ?? 0) < depth.current) close.current(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed with a button rather than the back swipe: take the sheet's step back out of the history.
      leaving.current = window.setTimeout(() => {
        if ((window.history.state as SheetState)?.sheet === depth.current) window.history.back();
      }, 0);
    };
  }, []);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, []);
  return (<>
    <div className="scrim" onClick={onClose} />
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div className="grab mob-only" />
      <div className="wrap sheet-body">
        <div className="sh"><h3>{title}</h3><div className="row">{action}<button className="link" onClick={onClose}>Done</button></div></div>
        {children}
      </div>
    </div>
  </>);
}

/** "Are you sure?" as a sheet in the app's own style, instead of the browser's pop-up. */
export function ConfirmSheet({ title, body, yes, danger, onYes, onClose }: {
  title: string; body: string; yes: string; danger?: boolean; onYes(): void; onClose(): void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="confirm-body">{body}</p>
      <div className="stack">
        <button className={`cta${danger ? " danger" : ""}`} onClick={() => { onClose(); onYes(); }}>{yes}</button>
        <button className="cta ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

/** Grey shimmering blocks shaped like the screen that's loading. */
export function Skeleton({ rows = 5, hero = false }: { rows?: number; hero?: boolean }) {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      {hero && <div className="sk sk-hero" />}
      {Array.from({ length: rows }, (_, i) => <div key={i} className="sk sk-row" />)}
    </div>
  );
}

// id, short label (phone bar and tablet rail), long label (desktop sidebar), icon
const TABS: [Tab, string, string, () => ReactNode][] = [
  ["week", "Week", "This week's picks", IconWeek],
  ["pool", "Pool", "Standings & money", IconPool],
  ["elim", "Elim", "Eliminator", IconElim],
  ["league", "League", "The Pool league", IconLeague],
  ["stats", "Stats", "Stats & every game", IconStats],
];

function go(setTab: (t: Tab) => void, t: Tab) {
  setTab(t);
  window.scrollTo({ top: 0 });
}

/** Bottom navigation bar on phones. */
export function TabBar() {
  const { tab, setTab } = useApp();
  return (
    <nav className="tabs" aria-label="Sections">
      <div className="inner">
        {TABS.map(([t, lab, , Icon]) => (
          <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => go(setTab, t)}>
            <span className="ic"><Icon /></span><span className="lb-t">{lab}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Left navigation on desktop, with a running season summary. */
export function SideNav() {
  const { season, me, tab, setTab, setMenu } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const done = season.weeks.flatMap((w) => w.games).filter((g) => g.result);
  const entry = record(done, ENTRY, ids);
  const m = money(season);
  const elim = elimSummary(season);
  const p = season.players.find((x) => x.id === me);
  return (
    <aside className="side-nav">
      <div className="brand"><i>B</i><span>BAKE Pool</span></div>
      <nav aria-label="Sections">
        {TABS.map(([t, short, lab, Icon]) => (
          <button key={t} className="item" aria-current={tab === t ? "page" : undefined} onClick={() => go(setTab, t)}>
            <Icon /><span className="long">{lab}</span><span className="short">{short}</span>
          </button>
        ))}
      </nav>
      <EntryCard />
      <div className="season">
        <div><span>Entry record</span><b>{fmtRec(entry)}</b></div>
        <div><span>Net each</span><b className={m.each < 0 ? "neg" : "pos"}>{m.each < 0 ? "-" : ""}${Math.abs(m.each).toFixed(0)}</b></div>
        <div><span>Eliminator</span><b>{elim.alive ? `${elim.livesLeft} ${elim.livesLeft === 1 ? "life" : "lives"}` : "Out"}</b></div>
      </div>
      <button className="me" onClick={() => setMenu(true)}>
        <span className="avatar sm" style={{ "--who": colorOf(me) } as CSSProperties}>{p?.initial}</span>
        <span className="who">{p?.name}<small>{p?.isAdmin ? "Admin · menu" : "Menu"}</small></span>
      </button>
    </aside>
  );
}
