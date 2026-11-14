"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { loadSeason, pickHistory, previewElim, previewEntry, supabaseMutations, type EntryRow, type Mutations } from "@/lib/data";
import { elimTeam, entryPick, humans, majority } from "@/lib/scoring";
import { nextDeadline } from "@/lib/deadline";
import type { Season } from "@/lib/scoring";
import { browserClient } from "@/lib/supabase/client";
import { ElimTab } from "./Elim";
import { LeagueTab } from "./League";
import { Login } from "./Login";
import { Menu } from "./Menu";
import { PoolTab } from "./Pool";
import { StatsTab } from "./Stats";
import { AppProvider, useApp } from "./store";
import { SideNav, Skeleton, TabBar } from "./ui";
import { useRealtime } from "./useRealtime";
import { WeekTab } from "./Week";

const noop = async () => {};

// The last season this phone loaded, kept for a fast start and for when there's no signal. Only ever shown to the
// same signed-in person, and cleared on sign-out.
const CACHE_KEY = "bake-season";
type Kept = { email: string; me: string; season: Season };
function readCache(email: string): Kept | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Kept | null;
    return c && c.email === email && c.season?.weeks ? c : null;
  } catch { return null; }
}
function saveCache(c: Kept) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* storage full or private mode */ } }
function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch { /* private mode */ } }

/** Demo data with the latest week reopened, so picking can be tried out. */
async function demoSeason(): Promise<Season> {
  const s = (await import("@/lib/fixture")).fixtureSeason(); // kept out of the production bundle
  const last = s.weeks.at(-1);
  if (last) last.deadline = nextDeadline().toISOString();
  s.weeks.forEach((w, i) => w.games.forEach((g) => (g.id = i * 100 + g.num)));
  s.weeks.forEach((w, i) => (w.id = i + 1));
  return s;
}
const demoMutations: Mutations = {
  setPick: noop, setLock: noop, setElimPick: noop, setResult: noop, setEntryCall: noop, updateWeek: noop, setElimWeek: noop, setPlayerEmail: noop, setSetting: noop,
};

function Screens() {
  const { tab, menu, reload, demo, setLive } = useApp();
  // Other people's picks, locks and results show up within a second or two.
  const live = useRealtime(!demo, reload);
  useEffect(() => setLive(live), [live, setLive]);
  // Keeps the app's files on the phone so it opens without signal (the published site only; not while developing).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  // Pick up other people's picks when the app comes back to the foreground.
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);
  return (<>
    <SideNav />
    <div className="shell">
      <div className="screen" key={tab}>
        {tab === "week" && <WeekTab />}
        {tab === "pool" && <PoolTab />}
        {tab === "elim" && <ElimTab />}
        {tab === "league" && <LeagueTab />}
        {tab === "stats" && <StatsTab />}
      </div>
    </div>
    <TabBar />
    {menu && <Menu />}
  </>);
}

export function PoolApp({ demo, loginError }: { demo: boolean; loginError?: string | null }) {
  const sb = useMemo(() => (demo ? null : browserClient()), [demo]);
  const [session, setSession] = useState<Session | null | undefined>(demo ? null : undefined);
  const [season, setSeason] = useState<Season | null>(null);
  const [me, setMe] = useState<string | null>(demo ? "brad" : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) void demoSeason().then(setSeason);
  }, [demo]);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  // Every successful load is also kept on the phone, so the app opens at once next time and still opens with no signal.
  const who = useRef<{ email: string; me: string } | null>(null);
  const load = useCallback(async () => {
    if (!sb) return demoSeason();
    const s = await loadSeason(sb);
    if (who.current) saveCache({ ...who.current, season: s });
    return s;
  }, [sb]);

  useEffect(() => {
    if (!sb || !session?.user.email) return;
    const email = session.user.email.toLowerCase();
    const kept = readCache(email);
    if (kept) { who.current = { email, me: kept.me }; setSeason(kept.season); setMe(kept.me); }
    load().then(async (s) => {
      const r = await sb.from("players").select("id").ilike("email", email).maybeSingle();
      if (!r.data) { setError(`${email} isn't on the pool list. Ask Brad to add it.`); return; }
      who.current = { email, me: r.data.id };
      saveCache({ email, me: r.data.id, season: s });
      setSeason(s); setMe(r.data.id);
    }).catch((e: Error) => { if (!kept) setError(navigator.onLine ? e.message : "You're offline, and this phone hasn't loaded the pool before. Connect and try again."); });
  }, [sb, session, load]);

  const signOut = useCallback(async () => {
    clearCache();
    if (sb) await sb.auth.signOut();
    window.location.href = "/";
  }, [sb]);

  const mutations = useMemo(() => (sb ? supabaseMutations(sb) : demoMutations), [sb]);
  const history = useCallback(async (gameId: number) => (sb ? pickHistory(sb, gameId) : []), [sb]);
  const previewE = useCallback(async (weekId: number) => {
    if (sb) return previewElim(sb, weekId);
    const w = season?.weeks.find((x) => x.id === weekId);
    return w && season ? elimTeam(w.elim, humans(season.players).map((p) => p.id)) : null;
  }, [sb, season]);
  const preview = useCallback(async (weekId: number): Promise<EntryRow[]> => {
    if (sb) return previewEntry(sb, weekId);
    // Demo: everything is local, so work it out from the loaded picks.
    const w = season?.weeks.find((x) => x.id === weekId);
    const ids = season ? humans(season.players).map((p) => p.id) : [];
    return (w?.games ?? []).map((g) => ({ num: g.num, entry: entryPick(g, ids) ?? "", how: majority(g, ids) ? "majority" : "claude" }));
  }, [sb, season]);

  const boot = <div className="boot"><div className="bar-ph" /><div className="wrap"><Skeleton hero rows={6} /></div></div>;
  if (session === undefined) return boot;
  if (!demo && !session) return <Login error={loginError} />;
  if (error) return (
    <main className="login"><div className="card"><p className="warn err">{error}</p>
      <button className="cta ghost gap-s" onClick={signOut}>Sign out</button></div></main>
  );
  if (!season || !me) return boot;

  return (
    <AppProvider initial={season} me={me} demo={demo} mutations={mutations} previewEntry={preview} previewElim={previewE} history={history} reload={load} signOut={signOut}>
      <Screens />
    </AppProvider>
  );
}
