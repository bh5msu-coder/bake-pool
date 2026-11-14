"use client";
// App-wide state: the season, who's signed in, and writes that update the
// screen immediately and roll back if the server refuses them.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EntryRow, HistoryRow, Mutations } from "@/lib/data";
import type { Season } from "@/lib/scoring";
import { buildRoute, parseRoute, SUBS, type Tab } from "@/lib/route";

export type { Tab };

type Op = { [K in keyof Mutations]: { kind: K; args: Parameters<Mutations[K]> } }[keyof Mutations];

/** Applies a write to an in-memory copy of the season. */
function applyLocal(s: Season, op: Op): Season {
  const next: Season = structuredClone(s);
  const game = (id: number) => next.weeks.flatMap((w) => w.games).find((g) => g.id === id);
  const week = (id: number) => next.weeks.find((w) => w.id === id);
  switch (op.kind) {
    case "setPick": {
      const [gid, pid, team] = op.args, g = game(gid);
      if (g) { if (team) g.picks[pid] = team; else delete g.picks[pid]; }
      break;
    }
    case "setLock": {
      const [wid, pid, locked] = op.args, w = week(wid);
      if (w) w.locks = locked ? [...new Set([...(w.locks ?? []), pid])] : (w.locks ?? []).filter((x) => x !== pid);
      break;
    }
    case "setElimPick": {
      const [wid, pid, team] = op.args, w = week(wid);
      if (w) { if (team) w.elim.picks[pid] = team; else delete w.elim.picks[pid]; }
      break;
    }
    case "setResult": { const g = game(op.args[0]); if (g) g.result = op.args[1]; break; }
    case "setEntryCall": { const g = game(op.args[0]); if (g) g.entryOverride = op.args[1]; break; }
    case "updateWeek": {
      const [wid, p] = op.args, w = week(wid);
      if (w) {
        if (p.deadline !== undefined) w.deadline = p.deadline;
        if (p.entry_fee !== undefined) w.entryFee = p.entry_fee;
        if (p.winnings !== undefined) w.winnings = p.winnings;
      }
      break;
    }
    case "setElimWeek": {
      const [wid, p] = op.args, w = week(wid);
      if (w) {
        if (p.override_team !== undefined) w.elim.override = p.override_team;
        if (p.outcome !== undefined) w.elim.outcome = p.outcome as "survived" | "died" | null;
      }
      break;
    }
    case "setSetting": {
      const [k, v] = op.args;
      if (k === "elim_buybacks") next.elimBuybacks = Number(v);
      else if (k === "elim_buyback_cost") next.elimBuybackCost = Number(v);
      else if (k === "ledger") next.ledger = v as Season["ledger"];
      else if (k === "season_fee") next.seasonFee = Number(v);
      else if (k === "grace_minutes") next.graceMinutes = Number(v);
      else if (k === "reminder_lead_minutes") next.reminderLeadMinutes = Number(v);
      break;
    }
    case "setPlayerEmail": break;
  }
  return next;
}

export interface ExploreFilter {
  weeks: Set<number>; league: Set<string>; band: Set<string>; side: Set<string>; split: Set<string>;
  picker: string; result: "any" | "W" | "L";
}
export const emptyFilter = (picker: string): ExploreFilter => ({
  weeks: new Set(), league: new Set(), band: new Set(), side: new Set(), split: new Set(), picker, result: "any",
});

interface Ctx {
  season: Season;
  me: string;
  isAdmin: boolean;
  demo: boolean;
  tab: Tab; setTab(t: Tab): void;
  /** The sub-view showing on a tab (Standings / Compare…), and a way to change it. */
  subOf(t: Tab): string; setSub(t: Tab, sub: string): void;
  /** False while the phone has no connection: the screen shows the last loaded data and picks can't be saved. */
  online: boolean;
  weekIdx: number; setWeekIdx(i: number): void;
  filter: ExploreFilter; setFilter(f: ExploreFilter): void;
  menu: boolean; setMenu(open: boolean): void;
  run<K extends keyof Mutations>(kind: K, ...args: Parameters<Mutations[K]>): Promise<boolean>;
  toast(msg: string, bad?: boolean): void;
  previewEntry(weekId: number): Promise<EntryRow[]>;
  previewElim(weekId: number): Promise<string | null>;
  history(gameId: number): Promise<HistoryRow[]>;
  reload(): Promise<void>;
  signOut(): Promise<void>;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(C);
  if (!v) throw new Error("useApp outside provider");
  return v;
};

/** A tab's sub-view, kept in the address so a refresh or shared link lands on the same view. */
export function useSub<T extends string>(tab: Tab): [T, (s: T) => void] {
  const { subOf, setSub } = useApp();
  return [subOf(tab) as T, (s: T) => setSub(tab, s)];
}

/** Index of the week people care about now: the open one, else the latest. */
export function defaultWeekIdx(s: Season, now = Date.now()) {
  const open = s.weeks.findIndex((w) => !w.deadline || Date.parse(w.deadline) > now);
  return open >= 0 ? open : Math.max(0, s.weeks.length - 1);
}

export function AppProvider(props: {
  initial: Season; me: string; demo: boolean; mutations: Mutations; previewEntry(weekId: number): Promise<EntryRow[]>; previewElim(weekId: number): Promise<string | null>; history(gameId: number): Promise<HistoryRow[]>;
  reload(): Promise<Season>; signOut(): Promise<void>; children: ReactNode;
}) {
  const { mutations, me, demo } = props;
  const [season, setSeason] = useState(props.initial);
  const current = useRef(season);
  current.current = season;
  // Where the app is lives in the address (/pool/compare, /week/9), so the back swipe, a refresh and
  // notification links all work. Tab changes add a history step; week and sub-view changes replace it.
  const first = useRef(typeof window === "undefined" ? { tab: "week" as Tab } : parseRoute(window.location.pathname)).current;
  const [tab, setTabState] = useState<Tab>(first.tab);
  const [subs, setSubs] = useState<Partial<Record<Tab, string>>>(() => ("sub" in first && first.sub ? { [first.tab]: first.sub } : {}));
  const weekFromRoute = (s: Season, n?: number) => {
    const i = n ? s.weeks.findIndex((w) => w.week === n) : -1;
    return i >= 0 ? i : defaultWeekIdx(s);
  };
  const [weekIdx, setWeekIdxState] = useState(() => weekFromRoute(props.initial, "week" in first ? first.week : undefined));
  const navMode = useRef<"push" | "replace">("replace");
  const scrolls = useRef<Partial<Record<Tab, number>>>({});
  const tabNow = useRef(tab);
  tabNow.current = tab;
  const lastPath = useRef(typeof window === "undefined" ? "/" : window.location.pathname);

  const setTab = useCallback((t: Tab) => {
    scrolls.current[tabNow.current] = window.scrollY;
    navMode.current = "push";
    setTabState(t);
  }, []);
  const setWeekIdx = useCallback((i: number) => setWeekIdxState(i), []);
  const setSub = useCallback((t: Tab, sub: string) => setSubs((p) => ({ ...p, [t]: sub })), []);
  const subOf = useCallback((t: Tab) => subs[t] ?? SUBS[t][0] ?? "", [subs]);

  useEffect(() => {
    const wk = season.weeks[weekIdx];
    const path = buildRoute({ tab, sub: subs[tab], week: wk && weekIdx !== defaultWeekIdx(season) ? wk.week : undefined });
    if (path !== window.location.pathname) {
      const url = path + window.location.search;
      // Leaving from inside an open sheet: reuse the sheet's history step for the new screen.
      const inSheet = !!(window.history.state as { sheet?: number } | null)?.sheet;
      if (navMode.current === "push" && !inSheet) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
      lastPath.current = path;
    }
    navMode.current = "replace";
  }, [tab, subs, weekIdx, season]);

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      if (path === lastPath.current) return; // a sheet closing, not a screen change
      lastPath.current = path;
      const r = parseRoute(path);
      setTabState(r.tab);
      if (SUBS[r.tab].length) setSubs((p) => ({ ...p, [r.tab]: r.sub ?? SUBS[r.tab][0] }));
      if (r.tab === "week" || r.tab === "elim") setWeekIdxState(weekFromRoute(current.current, r.week));
      const y = scrolls.current[r.tab] ?? 0;
      requestAnimationFrame(() => window.scrollTo({ top: y }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const [filter, setFilter] = useState(() => emptyFilter(me));
  const [menu, setMenu] = useState(false);
  const [toastMsg, setToast] = useState<{ msg: string; bad: boolean } | null>(null);

  const toast = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), bad ? 5000 : 2200);
  }, []);

  const run = useCallback(async <K extends keyof Mutations>(kind: K, ...args: Parameters<Mutations[K]>) => {
    if (!navigator.onLine && !demo) { toast("You're offline. Nothing was saved; try again when you have signal.", true); return false; }
    const before = current.current;
    current.current = applyLocal(before, { kind, args } as Op);
    setSeason(current.current);
    try {
      await (mutations[kind] as (...a: unknown[]) => Promise<void>)(...args);
      return true;
    } catch (e) {
      current.current = before;
      setSeason(before);
      toast((e as Error).message || "Couldn't save that.", true);
      return false;
    }
  }, [mutations, toast, demo]);

  // Reloading also moves the app forward: when a new week's lines arrive, the screen goes to it (the open week).
  // Nothing moves while the same week stays the default, so browsing an old week isn't interrupted.
  const reload = useCallback(async () => {
    try {
      const next = await props.reload();
      const before = defaultWeekIdx(current.current), after = defaultWeekIdx(next);
      setSeason(next);
      if (after !== before) setWeekIdx(after);
    } catch (e) { toast((e as Error).message, true); }
  }, [props, toast, setWeekIdx]);

  const isAdmin = !!season.players.find((p) => p.id === me)?.isAdmin;
  const value = useMemo<Ctx>(() => ({
    season, me, isAdmin, demo, tab, setTab, subOf, setSub, online, weekIdx, setWeekIdx, filter, setFilter, menu, setMenu, run, toast, reload, signOut: props.signOut,
    previewEntry: props.previewEntry, previewElim: props.previewElim, history: props.history,
  }), [season, me, isAdmin, demo, tab, setTab, subOf, setSub, online, weekIdx, setWeekIdx, filter, menu, run, toast, reload, props.signOut, props.previewEntry, props.previewElim, props.history]);

  return (
    <C.Provider value={value}>
      {props.children}
      {toastMsg && <div className={`toast${toastMsg.bad ? " bad" : ""}`} role="status">{toastMsg.msg}</div>}
    </C.Provider>
  );
}
