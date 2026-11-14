"use client";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";

const TABLES = ["picks", "pick_locks", "games", "elim_picks", "elim_weeks", "weeks"] as const;

/**
 * Live updates: when anyone's picks, locks, results or eliminator votes change, reload the season a moment later
 * (several changes in a burst become one reload). Returns true while the live connection is up.
 * The app still reloads when it comes back to the foreground, so nothing is lost if the connection drops.
 */
export function useRealtime(enabled: boolean, reload: () => void | Promise<void>) {
  const [live, setLive] = useState(false);
  const fn = useRef(reload);
  fn.current = reload;
  useEffect(() => {
    if (!enabled) return;
    const sb = browserClient();
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void fn.current(), 500);
    };
    let ch = sb.channel("season");
    for (const table of TABLES) ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, bump);
    ch.subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { window.clearTimeout(timer); setLive(false); void sb.removeChannel(ch); };
  }, [enabled]);
  return live;
}
