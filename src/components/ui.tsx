"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useApp, type Tab } from "./store";

export function Header({ title, sub, right, strip }: { title: string; sub?: string; right?: ReactNode; strip?: ReactNode }) {
  const { season, me } = useApp();
  const p = season.players.find((x) => x.id === me);
  return (
    <header className="top">
      <div className="wrap bar">
        <h1>{title}{sub && <small>{sub}</small>}</h1>
        {right}
        <MenuButton initial={p?.initial ?? "?"} />
      </div>
      {strip}
    </header>
  );
}

function MenuButton({ initial }: { initial: string }) {
  const { setMenu } = useApp();
  return <button className="avatar" onClick={() => setMenu(true)} aria-label="Menu">{initial}</button>;
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
      <div className="grab" />
      <div className="wrap">
        <div className="sh"><h3>{title}</h3><div className="row">{action}<button className="link" onClick={onClose}>DONE</button></div></div>
        {children}
      </div>
    </div>
  </>);
}

const TABS: [Tab, string, string][] = [
  ["week", "WEEK", "picks"], ["pool", "POOL", "standings"], ["elim", "ELIM", "eliminator"], ["explore", "EXPLORE", "every game"],
];

export function TabBar() {
  const { tab, setTab } = useApp();
  return (
    <nav className="tabs">
      <div className="inner" role="tablist" aria-label="Sections">
        {TABS.map(([t, lab, sub]) => (
          <button key={t} role="tab" aria-selected={tab === t}
            onClick={() => { setTab(t); window.scrollTo({ top: 0 }); }}>
            {lab}<span>{sub}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
