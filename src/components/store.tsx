"use client";
// App-wide state: the season, who's signed in, and writes that update the
// screen immediately and roll back if the server refuses them.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Mutations } from "@/lib/data";
import type { Season } from "@/lib/scoring";

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
    case "setOverride": { const g = game(op.args[0]); if (g) g.entryOverride = op.args[1]; break; }
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
      break;
    }
    case "setPlayerEmail": break;
  }
  return next;
}

export type Tab = "week" | "pool" | "league" | "elim" | "explore";

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
  weekIdx: number; setWeekIdx(i: number): void;
  filter: ExploreFilter; setFilter(f: ExploreFilter): void;
  menu: boolean; setMenu(open: boolean): void;
  run<K extends keyof Mutations>(kind: K, ...args: Parameters<Mutations[K]>): Promise<boolean>;
  toast(msg: string, bad?: boolean): void;
  reload(): Promise<void>;
  signOut(): Promise<void>;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(C);
  if (!v) throw new Error("useApp outside provider");
  return v;
};

/** Index of the week people care about now: the open one, else the latest. */
export function defaultWeekIdx(s: Season, now = Date.now()) {
  const open = s.weeks.findIndex((w) => !w.deadline || Date.parse(w.deadline) > now);
  return open >= 0 ? open : Math.max(0, s.weeks.length - 1);
}

export function AppProvider(props: {
  initial: Season; me: string; demo: boolean; mutations: Mutations;
  reload(): Promise<Season>; signOut(): Promise<void>; children: ReactNode;
}) {
  const { mutations, me, demo } = props;
  const [season, setSeason] = useState(props.initial);
  const current = useRef(season);
  current.current = season;
  const [tab, setTab] = useState<Tab>("week");
  const [weekIdx, setWeekIdx] = useState(() => defaultWeekIdx(props.initial));
  const [filter, setFilter] = useState(() => emptyFilter(me));
  const [menu, setMenu] = useState(false);
  const [toastMsg, setToast] = useState<{ msg: string; bad: boolean } | null>(null);

  const toast = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), bad ? 5000 : 2200);
  }, []);

  const run = useCallback(async <K extends keyof Mutations>(kind: K, ...args: Parameters<Mutations[K]>) => {
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
  }, [mutations, toast]);

  // Reloading also moves the app forward: when a new week's lines arrive, the screen goes to it (the open week).
  // Nothing moves while the same week stays the default, so browsing an old week isn't interrupted.
  const reload = useCallback(async () => {
    try {
      const next = await props.reload();
      const before = defaultWeekIdx(current.current), after = defaultWeekIdx(next);
      setSeason(next);
      if (after !== before) setWeekIdx(after);
    } catch (e) { toast((e as Error).message, true); }
  }, [props, toast]);

  const isAdmin = !!season.players.find((p) => p.id === me)?.isAdmin;
  const value = useMemo<Ctx>(() => ({
    season, me, isAdmin, demo, tab, setTab, weekIdx, setWeekIdx, filter, setFilter, menu, setMenu, run, toast, reload, signOut: props.signOut,
  }), [season, me, isAdmin, demo, tab, weekIdx, filter, menu, run, toast, reload, props.signOut]);

  return (
    <C.Provider value={value}>
      {props.children}
      {toastMsg && <div className={`toast${toastMsg.bad ? " bad" : ""}`} role="status">{toastMsg.msg}</div>}
    </C.Provider>
  );
}
