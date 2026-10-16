"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { colorOf } from "@/lib/players";
import { ENTRY, elimSummary, fmtRec, humans, money, record } from "@/lib/scoring";
import { IconElim, IconExplore, IconPool, IconWeek } from "./icons";
import { useApp, type Tab } from "./store";

export function Header({ title, sub, right, strip }: { title: string; sub?: string; right?: ReactNode; strip?: ReactNode }) {
  const { season, me, setMenu } = useApp();
  const p = season.players.find((x) => x.id === me);
  return (
    <header className="top">
      <div className="wrap bar">
        <h1>{title}{sub && <small>{sub}</small>}</h1>
        {right}
        <button className="avatar" style={{ "--who": colorOf(me) } as CSSProperties} onClick={() => setMenu(true)} aria-label="Menu">
          {p?.initial ?? "?"}
        </button>
      </div>
      {strip}
    </header>
  );
}

export function Sheet({ title, onClose, children, action }: { title: string; onClose(): void; children: ReactNode; action?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [onClose]);
  return (<>
    <div className="scrim" onClick={onClose} />
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div className="grab mob-only" />
      <div className="wrap" style={{ paddingTop: 6 }}>
        <div className="sh"><h3>{title}</h3><div className="row">{action}<button className="link" onClick={onClose}>Done</button></div></div>
        {children}
      </div>
    </div>
  </>);
}

const TABS: [Tab, string, string, () => ReactNode][] = [
  ["week", "Week", "This week's picks", IconWeek],
  ["pool", "Pool", "Standings & stats", IconPool],
  ["elim", "Elim", "Eliminator", IconElim],
  ["explore", "Explore", "Every game", IconExplore],
];

function go(setTab: (t: Tab) => void, t: Tab) {
  setTab(t);
  window.scrollTo({ top: 0 });
}

/** Bottom tab bar on phones. */
export function TabBar() {
  const { tab, setTab } = useApp();
  return (
    <nav className="tabs">
      <div className="inner" role="tablist" aria-label="Sections">
        {TABS.map(([t, lab, , Icon]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => go(setTab, t)}>
            <Icon />{lab}
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
    <aside className="side-nav" aria-label="Sections">
      <div className="brand"><i>B</i>BAKE Pool</div>
      {TABS.map(([t, , lab, Icon]) => (
        <button key={t} className="item" aria-current={tab === t ? "page" : undefined} onClick={() => go(setTab, t)}>
          <Icon />{lab}
        </button>
      ))}
      <div className="season">
        <div><span>Entry record</span><b>{fmtRec(entry)}</b></div>
        <div><span>Net each</span><b className={m.each < 0 ? "neg" : "pos"}>{m.each < 0 ? "-" : ""}${Math.abs(m.each).toFixed(0)}</b></div>
        <div><span>Eliminator</span><b>{elim.alive ? `${elim.livesLeft} ${elim.livesLeft === 1 ? "life" : "lives"}` : "Out"}</b></div>
      </div>
      <button className="me" onClick={() => setMenu(true)}>
        <span className="avatar" style={{ "--who": colorOf(me), display: "grid", placeItems: "center", width: 34, height: 34 } as CSSProperties}>{p?.initial}</span>
        <span>{p?.name}<small>{p?.isAdmin ? "Admin · menu" : "Menu"}</small></span>
      </button>
    </aside>
  );
}
