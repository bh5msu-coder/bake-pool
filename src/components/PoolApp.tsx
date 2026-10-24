"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { loadSeason, previewElim, previewEntry, supabaseMutations, type EntryRow, type Mutations } from "@/lib/data";
import { elimTeam, entryPick, humans, majority } from "@/lib/scoring";
import { nextDeadline } from "@/lib/deadline";
import type { Season } from "@/lib/scoring";
import { browserClient } from "@/lib/supabase/client";
import { ElimTab } from "./Elim";
import { ExploreTab } from "./Explore";
import { LeagueTab } from "./League";
import { Login } from "./Login";
import { Menu } from "./Menu";
import { PoolTab } from "./Pool";
import { AppProvider, useApp } from "./store";
import { SideNav, TabBar } from "./ui";
import { WeekTab } from "./Week";

const noop = async () => {};

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
  setPick: noop, setLock: noop, setElimPick: noop, setResult: noop, updateWeek: noop, setElimWeek: noop, setPlayerEmail: noop, setSetting: noop,
};

function Screens() {
  const { tab, menu, reload } = useApp();
  // Pick up other people's picks when the app comes back to the foreground.
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);
  return (<>
    <SideNav />
    <div className="shell">
      {tab === "week" && <WeekTab />}
      {tab === "pool" && <PoolTab />}
      {tab === "league" && <LeagueTab />}
      {tab === "elim" && <ElimTab />}
      {tab === "explore" && <ExploreTab />}
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

  const load = useCallback(async () => {
    if (!sb) return demoSeason();
    return loadSeason(sb);
  }, [sb]);

  useEffect(() => {
    if (!sb || !session?.user.email) return;
    const email = session.user.email.toLowerCase();
    load().then((s) => {
      setSeason(s);
      return sb.from("players").select("id").ilike("email", email).maybeSingle();
    }).then((r) => {
      if (!r?.data) setError(`${email} isn't on the pool list. Ask Brad to add it.`);
      else setMe(r.data.id);
    }).catch((e: Error) => setError(e.message));
  }, [sb, session, load]);

  const signOut = useCallback(async () => {
    if (sb) await sb.auth.signOut();
    window.location.href = "/";
  }, [sb]);

  const mutations = useMemo(() => (sb ? supabaseMutations(sb) : demoMutations), [sb]);
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

  if (session === undefined) return <div className="empty">Loading…</div>;
  if (!demo && !session) return <Login error={loginError} />;
  if (error) return (
    <main className="login"><div className="card"><p className="warn err">{error}</p>
      <button className="cta ghost" style={{ marginTop: 12 }} onClick={signOut}>Sign out</button></div></main>
  );
  if (!season || !me) return <div className="empty">Loading the pool…</div>;

  return (
    <AppProvider initial={season} me={me} demo={demo} mutations={mutations} previewEntry={preview} previewElim={previewE} reload={load} signOut={signOut}>
      <Screens />
    </AppProvider>
  );
}
