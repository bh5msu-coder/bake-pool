"use client";
// Live scores for one week, shared by the Week tab and the sidebar's Entry card.
import { useEffect, useState } from "react";
import type { LiveGame } from "@/lib/scores";
import type { Game, Week } from "@/lib/scoring";

export type LiveMap = Map<number, LiveGame>;
export interface Live { live: LiveMap; updatedAt: number | null }

/** Last fetch per URL, so two screens watching the same week share a request (the server caches 30s anyway). */
const recent = new Map<string, { at: number; games: LiveGame[] }>();
const FRESH_MS = 25_000;

/**
 * Polls live scores while a week's games are near or underway and the app is visible:
 * every minute when something is live or about to kick off, every 5 minutes otherwise.
 */
export function useLive(week: Week | undefined, demo: boolean): Live {
  const [state, setState] = useState<Live>({ live: new Map(), updatedAt: null });
  const id = week?.id, deadline = week?.deadline, num = week?.week;
  const allGraded = !!week && week.games.length > 0 && week.games.every((g) => g.result);
  useEffect(() => {
    setState({ live: new Map(), updatedAt: null });
    if (!id || !deadline || allGraded) return;
    // Demo reopens the latest week for picking, so it skips the time window and asks for that week's real scores.
    const start = Date.parse(deadline) - 6 * 864e5, end = Date.parse(deadline) + 8 * 864e5;
    if (!demo && (Date.now() < start || Date.now() > end)) return;
    const url = demo ? `/api/scores?demoWeek=${num}` : `/api/scores?weekId=${id}`;
    let stop = false, timer = 0;
    const load = async () => {
      let next = 300_000;
      if (document.visibilityState === "visible") {
        try {
          const hit = recent.get(url);
          let got = hit && Date.now() - hit.at < FRESH_MS ? hit : null;
          if (!got) {
            const res = await fetch(url);
            if (res.ok) {
              got = { at: Date.now(), games: ((await res.json()) as { games: LiveGame[] }).games };
              recent.set(url, got);
            }
          }
          if (got && !stop) {
            setState({ live: new Map(got.games.map((g) => [g.num, g])), updatedAt: got.at });
            const soon = got.games.some((g) => g.state === "in" || (g.state === "pre" && Date.parse(g.start) - Date.now() < 20 * 60_000));
            if (soon) next = 60_000;
          }
        } catch { /* keep the last scores on a network blip */ }
      }
      if (!stop) timer = window.setTimeout(load, next);
    };
    void load();
    const onVis = () => { if (document.visibilityState === "visible") { window.clearTimeout(timer); void load(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [id, deadline, num, allGraded, demo]);
  return state;
}

/** Results so far, plus whoever is covering right now in games still being played. */
export function projected(week: Week, live: LiveMap): Game[] {
  return week.games.map((g) => {
    const l = live.get(g.num);
    return g.result || !l || l.state === "pre" || !l.covering ? g : { ...g, result: l.covering };
  });
}
