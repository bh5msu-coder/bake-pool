"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDay, fmtDeadline, fmtShort, fmtTime, phaseOf, softDeadline, timeLeft } from "@/lib/deadline";
import { chipClass, colorOf, cvar } from "@/lib/players";
import {
  ENTRY, entryLines, labelOf, entryPick, fmtPct, fmtRec, grade, groupLocked, humans, isGraded, isOpen, majority, MAJORITY,
  pickedCount, record, revealed, split,
  type Game, type Week,
} from "@/lib/scoring";
import type { LiveGame } from "@/lib/scores";
import { spreadFor } from "@/lib/teams";
import { Header, Sheet } from "./ui";
import { useApp } from "./store";

type Show = "all" | "todo" | "ties";
type LiveMap = Map<number, LiveGame>;

/**
 * Polls live scores while a week's games are near or underway and the app is visible:
 * every minute when something is live or about to kick off, every 5 minutes otherwise.
 */
function useLive(week: Week | undefined, demo: boolean): LiveMap {
  const [live, setLive] = useState<LiveMap>(new Map());
  const id = week?.id, deadline = week?.deadline, num = week?.week;
  const allGraded = !!week && week.games.length > 0 && week.games.every((g) => g.result);
  useEffect(() => {
    setLive(new Map());
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
          const res = await fetch(url);
          if (res.ok) {
            const games = ((await res.json()) as { games: LiveGame[] }).games;
            if (!stop) setLive(new Map(games.map((g) => [g.num, g])));
            const soon = games.some((g) => g.state === "in" || (g.state === "pre" && Date.parse(g.start) - Date.now() < 20 * 60_000));
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
  return live;
}

/** Results so far, plus whoever is covering right now in games still being played. */
function projected(week: Week, live: LiveMap) {
  return week.games.map((g) => {
    const l = live.get(g.num);
    return g.result || !l || l.state === "pre" || !l.covering ? g : { ...g, result: l.covering };
  });
}

/** ESPN writes "15:00 - 3rd"; a scoreboard reads better as "3rd 15:00". */
const clock = (d: string) => { const m = /^(.+?) - (.+)$/.exec(d); return m ? `${m[2]} ${m[1]}` : d; };

const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

interface Section { key: string; title: string; live?: boolean; games: Game[] }

/** Live now → upcoming by day (in kickoff order) → final. Without live data, one plain list. */
function sections(games: Game[], live: LiveMap): Section[] {
  if (!live.size) return [{ key: "all", title: `${games.length} games`, games }];
  const done = (g: Game) => !!g.result || live.get(g.num)?.state === "post";
  const now = games.filter((g) => !done(g) && live.get(g.num)?.state === "in");
  const later = games.filter((g) => !done(g) && live.get(g.num)?.state !== "in")
    .sort((a, b) => (live.get(a.num)?.start ?? "").localeCompare(live.get(b.num)?.start ?? "") || a.num - b.num);
  const out: Section[] = [];
  if (now.length) out.push({ key: "live", title: "Live now", live: true, games: now });
  for (const g of later) {
    const s = live.get(g.num)?.start;
    const day = s ? dayFmt.format(new Date(s)) : "Time TBD";
    const last = out.at(-1);
    if (last?.key === `day:${day}`) last.games.push(g);
    else out.push({ key: `day:${day}`, title: day, games: [g] });
  }
  const finals = games.filter(done);
  if (finals.length) out.push({ key: "final", title: "Final", games: finals });
  return out;
}

export function WeekTab() {
  const { season, me, isAdmin, demo, weekIdx, setWeekIdx, reload } = useApp();
  const week = season.weeks[weekIdx];
  const live = useLive(week, demo);
  const [as, setAs] = useState(me);
  const [show, setShow] = useState<Show>("all");
  // "To pick" holds on to the games that were blank when it was chosen, so a row doesn't vanish the moment you pick it.
  const [todo, setTodo] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Game | null>(null);
  const [picker, setPicker] = useState(false);
  const ids = humans(season.players).map((p) => p.id);
  const blanks = (week?.games ?? []).filter((g) => !g.picks[as]).map((g) => g.num);
  const pickShow = (s: Show) => { if (s === "todo") setTodo(new Set(blanks)); setShow(s); };

  const weekKey = week?.id ?? week?.week, weekOpen = !!week && isOpen(week);

  // While picks are hidden, check every minute who has locked (and, once the group has, load everyone's picks).
  const weekVisible = !!week && revealed(week, season.players);
  useEffect(() => {
    if (!weekOpen || weekVisible || demo) return;
    const t = window.setInterval(() => document.visibilityState === "visible" && void reload(), 60_000);
    return () => window.clearInterval(t);
  }, [weekOpen, weekVisible, demo, reload]);

  // When the last person locks, the group entry is final: load everyone's picks and write them to the sheet now.
  const pushedFor = useRef<number | null>(null);
  const final_ = !!week && weekOpen && groupLocked(week, season.players);
  useEffect(() => {
    if (!final_ || !week?.id || demo || pushedFor.current === week.id) return;
    pushedFor.current = week.id;
    void reload();
    void fetch("/api/sheet/lock-push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weekId: week.id }) });
  }, [final_, week?.id, demo, reload]);

  // After a new pick, scroll to the next game you haven't picked (in screen order, wrapping to the top).
  const jumpFrom = (num: number) => window.setTimeout(() => {
    const rows = [...document.querySelectorAll<HTMLElement>("article.sb[data-num]")];
    const at = rows.findIndex((el) => el.dataset.num === String(num));
    const next = [...rows.slice(at + 1), ...rows.slice(0, Math.max(0, at))].find((el) => el.dataset.blank === "1");
    // That was the last one: bring up the lock button instead.
    (next ?? document.querySelector<HTMLElement>(".done-bar"))?.scrollIntoView({ block: "center" });
  }, 30);

  // Land on "To pick" when a week opens with games left to pick, otherwise on everything.
  useEffect(() => {
    const left = (week?.games ?? []).filter((g) => !g.picks[as]).map((g) => g.num);
    setTodo(new Set(left));
    setShow(weekOpen && left.length ? "todo" : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, weekOpen, as]);

  const nav = (
    <div className="wknav">
      <button className="iconbtn" disabled={weekIdx <= 0} onClick={() => setWeekIdx(weekIdx - 1)} aria-label="Previous week">‹</button>
      <button className="iconbtn" disabled={weekIdx >= season.weeks.length - 1} onClick={() => setWeekIdx(weekIdx + 1)} aria-label="Next week">›</button>
    </div>
  );

  if (!week) {
    return (<>
      <Header title="This week" right={nav} />
      <main className="wrap"><div className="empty"><b>No lines yet</b>
        {isAdmin ? "Open the menu and tap Refresh lines to pull this week from the sheet." : "Brad will load this week's lines from John's sheet soon."}
      </div></main>
    </>);
  }

  const open = isOpen(week);
  const graded = isGraded(week);
  const final = week.games.every((g) => g.result);
  const visible = revealed(week, season.players);
  const locked = !!week.locks?.includes(as);
  const canPick = open && !locked;
  const view: Show = open && (show !== "ties" || visible) ? show : "all";
  const filtered = week.games.filter((g) =>
    view === "todo" ? todo.has(g.num) : view === "ties" ? split(g, ids) === "2-2" : true);
  const secs = sections(filtered, live);
  const playing = week.games.filter((g) => !g.result && live.get(g.num)?.state === "in").length;
  const proj = projected(week, live);
  const shown = detail && week.games.find((g) => g.id === detail.id && g.num === detail.num);

  const dl = deadlines(week, season.graceMinutes);
  const mine = week.games.filter((g) => g.picks[as]).length;
  const summary = open ? (
    <div className="summary">
      <span>{as === me ? "You" : season.players.find((p) => p.id === as)?.name} {mine}/{week.games.length} picked</span>
      <span className="sep" />
      {dl.phase === "grace"
        ? <span className="late">Grace period · locks in {dl.toLock}</span>
        : <span className="q">{dl.toDue ? `Due in ${dl.toDue}` : "No deadline set"}</span>}
    </div>
  ) : (
    <div className="summary">
      <span>Entry {fmtRec(record(proj, ENTRY, ids))}</span>
      <span className="sep" />
      <span className="q">You {fmtRec(record(proj, me, ids))}</span>
      {playing > 0 && <><span className="sep" /><span><span className="live-dot" />{playing} live</span></>}
      {!playing && !final && graded && <><span className="sep" /><span className="q">{proj.filter((g) => g.result).length}/{week.games.length} done</span></>}
    </div>
  );

  const sub = open ? (!dl.due ? "Open for picks"
      : dl.phase === "grace" ? `Picks were due ${fmtTime(dl.due)} · lock ${fmtTime(week.deadline!)}`
      : `Picks due ${fmtShort(dl.due)}`)
    : final ? "Final" : playing ? "Games in progress" : graded ? "In progress" : "Locked";

  return (<>
    <Header title={labelOf(week)} sub={sub} right={nav} strip={summary} onTitle={() => setPicker(true)} />
    <main className="wrap">
      <div className="week-layout">
        <div>
          {open && <div className="mob-only"><Status week={week} as={as} setAs={setAs} compact /></div>}
          <section style={{ paddingTop: open ? 4 : 14 }}>
            {(open || isAdmin) && (
              <div className="row" style={{ marginBottom: 4, flexWrap: "wrap" }}>
                {open && (
                  <div className="pills" role="group" aria-label="Show">
                    {(visible ? ["all", "todo", "ties"] as Show[] : ["all", "todo"] as Show[]).map((s) => (
                      <button key={s} className="pill" aria-pressed={view === s} onClick={() => pickShow(s)}>
                        {s === "all" ? "All games" : s === "todo" ? "To pick" : "2-2 splits"}
                        <small>{s === "all" ? week.games.length : s === "todo" ? blanks.length
                          : week.games.filter((g) => split(g, ids) === "2-2").length}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="cover-key">
              <span><u />{as === me ? "Your pick" : `${season.players.find((p) => p.id === as)?.name}'s pick`}</span>
              {visible && <span><b className="entry-ck">✓</b>Group entry</span>}
              {live.size > 0 && <span><i />Covering the spread</span>}
            </div>
            {secs.map((sec) => (
              <div key={sec.key}>
                <h2 className={`sec-h${sec.live ? " live" : ""}`}>
                  {sec.live && <span className="live-dot" />}{sec.title}<span className="n">{sec.games.length}</span>
                </h2>
                <div className="games">
                  {sec.games.map((g) => <GameRow key={g.id ?? g.num} game={g} open={canPick} hidden={!visible} as={as} live={live.get(g.num)}
                    onMore={() => setDetail(g)} onPicked={() => jumpFrom(g.num)} />)}
                </div>
              </div>
            ))}
            {open && !blanks.length && !groupLocked(week, season.players) && humans(season.players).some((p) => p.id === as) && (
              <div className="done-bar">
                <span>{locked ? "Locked. You can unlock until everyone else has locked." : `All ${week.games.length} picked. Happy with them?`}</span>
                <LockButton week={week} as={as} />
              </div>
            )}
            {!filtered.length && <div className="empty"><b>{view === "todo" ? "All picked" : "Nothing here"}</b>{view === "todo" ? "Every game has your pick. Tap All games to review or change them." : "No 2-2 splits this week."}</div>}
          </section>
          {!open && graded && <div className="mob-only card" style={{ marginBottom: 16 }}><WeekStandings week={week} games={proj} /></div>}
        </div>
        <aside className="rail-col desk-only" style={{ paddingTop: 18 }}>
          {open && <div className="card"><Status week={week} as={as} setAs={setAs} /></div>}
          {!open && <div className="card"><WeekStandings week={week} games={proj} /></div>}
        </aside>
      </div>
    </main>
    {shown && <GameSheet game={shown} week={week} hidden={!visible} live={live.get(shown.num)} onClose={() => setDetail(null)} />}
    {picker && <WeekPicker onClose={() => setPicker(false)} />}
  </>);
}

function WeekPicker({ onClose }: { onClose(): void }) {
  const { season, weekIdx, setWeekIdx } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  return (
    <Sheet title="Choose a week" onClose={onClose}>
      <div className="list">
        {season.weeks.map((w, i) => {
          const fin = w.games.length > 0 && w.games.every((g) => g.result);
          const status = isOpen(w) ? "Open" : fin ? "Final" : isGraded(w) ? "In progress" : "Locked";
          return (
            <button key={w.week} className="slice" aria-current={i === weekIdx ? "true" : undefined}
              style={i === weekIdx ? { background: "var(--accent-soft)" } : undefined}
              onClick={() => { setWeekIdx(i); onClose(); window.scrollTo({ top: 0 }); }}>
              <span className="k">{labelOf(w)}<small>{status}</small></span>
              <span className="r">{isGraded(w) ? `Entry ${fmtRec(record(w.games, ENTRY, ids))}` : ""}</span>
              <span className="go">›</span>
            </button>
          );
        })}
        {(season.upcoming ?? []).map((u) => (
          <div key={`u${u.week}`} className="slice upcoming" aria-disabled="true">
            <span className="k">{u.label}<small>Lines not posted yet</small></span>
            <span className="r">{u.deadline ? `~${fmtShort(softDeadline(u.deadline, season.graceMinutes)).replace(/ \d.*$/, "")} ${fmtDay(u.deadline)}` : "Date TBD"}</span>
            <span className="go" />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** Pick progress. Compact (phones) drops the countdown, which the header already shows. */
/** Soft deadline (picks due), hard lock, the phase between them and the time left to each. */
function deadlines(week: Week, grace: number) {
  const due = week.deadline ? softDeadline(week.deadline, grace) : null;
  return {
    due, phase: phaseOf(week.deadline, grace),
    toDue: due ? timeLeft(due) : null, toLock: week.deadline ? timeLeft(week.deadline) : null,
  };
}

function Status({ week, as, setAs, compact }: { week: Week; as: string; setAs(id: string): void; compact?: boolean }) {
  const { season, me, isAdmin, toast } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const dl = deadlines(week, season.graceMinutes);
  const grace = dl.phase === "grace";
  const mine = week.games.filter((g) => g.picks[as]).length;
  const entry = entryLines(week, ids);
  const missing = week.games.reduce((n, g) => n + ids.filter((id) => !g.picks[id]).length, 0);
  const total = week.games.length;
  const isHuman = humans(season.players).some((p) => p.id === as);
  const locked = !!week.locks?.includes(as);
  const final = groupLocked(week, season.players);
  const waiting = humans(season.players).filter((p) => !week.locks?.includes(p.id)).map((p) => p.name);
  const claudeLeft = total - pickedCount(week, "claude");

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.text);
      toast(`Copied ${entry.lines.length} lines`);
    } catch {
      toast("Couldn't reach the clipboard. Long-press to copy instead.", true);
    }
  }

  return (
    <section className={`status${compact ? " compact" : ""}`} style={{ paddingTop: compact ? 12 : 16 }}>
      {!compact && <div>
        <div className="lock">
          <span className={`big${grace ? " late" : ""}`}>{(grace ? dl.toLock : dl.toDue) ?? "—"}</span>
          <span className="lab">{grace ? "grace period left" : dl.toDue ? "until picks are due" : week.deadline ? "Locked" : "No deadline set"}</span>
        </div>
        {dl.due && week.deadline && (
          <div className="lab" style={{ marginTop: 4 }}>
            {grace ? `Picks were due ${fmtTime(dl.due)}. They lock at ${fmtTime(week.deadline)}.`
              : `Due ${fmtDeadline(dl.due)} · grace until ${fmtTime(week.deadline)}`}
          </div>
        )}
      </div>}
      <div>
        <div className="row" style={{ marginBottom: 6 }}>
          {isAdmin ? (
            <label className="lab row" style={{ gap: 6 }}>
              Picking as
              <select value={as} onChange={(e) => setAs(e.target.value)} className="btn" style={{ minHeight: 32, padding: "0 8px" }}>
                {season.players.map((p) => <option key={p.id} value={p.id}>{p.id === me ? `${p.name} (you)` : p.name}</option>)}
              </select>
            </label>
          ) : <span className="lab">Your picks</span>}
          {locked && <span className="tag accent" style={{ marginLeft: 6 }}>Locked</span>}
          <span className="spacer" />
          <b className="num">{mine} / {week.games.length}</b>
        </div>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={week.games.length} aria-valuenow={mine}>
          <i style={{ width: `${(mine / Math.max(1, week.games.length)) * 100}%` }} />
        </div>
      </div>
      <div className="progress">
        {season.players.map((p) => {
          const n = pickedCount(week, p.id), lk = week.locks?.includes(p.id);
          return (
            <div key={p.id} className={lk || (p.kind !== "human" && n === total) ? "done" : ""}
              title={lk ? `${p.name} has locked` : `${p.name}: ${n} of ${total} picked`}>
              <i className="dot" style={cvar(p.id)} /><span>{p.name}</span><b>{lk ? "🔒" : n}</b>
            </div>
          );
        })}
      </div>
      {final ? (
        <p className="ok-note">Everyone has locked and Claude is in. The group entry is final.</p>
      ) : isHuman && <LockButton week={week} as={as} />}
      {!final && (
        <p className="hint" style={{ margin: 0 }}>
          Picks stay hidden until everyone locks{claudeLeft > 0 ? " and Claude is in" : ""}, or the deadline passes.
          {waiting.length > 0 && ` Waiting on ${waiting.join(", ")}${claudeLeft > 0 ? `; Claude has ${claudeLeft} to go` : ""}.`}
          {!waiting.length && claudeLeft > 0 && ` Claude has ${claudeLeft} to go.`}
        </p>
      )}
      {/* The entry writes itself to the sheet at the deadline; copying is a manual fallback for Brad. */}
      {isAdmin && !compact && (
        <button className="btn" onClick={copy} disabled={entry.blanks > 0}>
          {entry.blanks ? `${entry.blanks} game${entry.blanks > 1 ? "s" : ""} still blank`
            : missing ? `Copy entry · ${missing} picks missing` : `Copy entry · ${entry.lines.length} lines`}
        </button>
      )}
      {!compact && (
        <p className="hint" style={{ margin: 0 }}>
          Majority (3 of 4) makes the entry; Claude breaks 2-2 splits. It goes into the sheet as soon as everyone locks, or at the deadline.
        </p>
      )}
    </section>
  );
}

/** Lock or unlock one person's picks for the week. Locking needs every game picked. */
function LockButton({ week, as }: { week: Week; as: string }) {
  const { season, me, run } = useApp();
  const total = week.games.length;
  const mine = week.games.filter((g) => g.picks[as]).length;
  const name = season.players.find((p) => p.id === as)?.name;
  if (week.locks?.includes(as)) {
    return (
      <button className="btn" onClick={() => void run("setLock", week.id!, as, false)} disabled={!week.id}>
        🔒 {as === me ? "Your" : `${name}'s`} picks are locked · Unlock
      </button>
    );
  }
  return (
    <button className="cta" onClick={() => void run("setLock", week.id!, as, true)} disabled={!week.id || mine < total}>
      {mine < total ? `Pick all ${total} to lock (${total - mine} left)` : `Lock ${as === me ? "my" : `${name}'s`} picks`}
    </button>
  );
}

function WeekStandings({ week, games }: { week: Week; games: Game[] }) {
  const { season, me } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const counted = games.filter((g) => g.result).length;
  const rows = [...season.players.map((p) => ({ id: p.id, name: p.name })), { id: ENTRY, name: "Entry" }, { id: MAJORITY, name: "Majority" }]
    .map((r) => ({ ...r, rec: record(games, r.id, ids) }))
    .sort((a, b) => b.rec.w - a.rec.w || a.rec.l - b.rec.l);
  return (<>
    <p className="eyebrow">{labelOf(week)} standings</p>
    <div className="list">
      {rows.map((r) => (
        <div key={r.id} className={`st${r.id === me ? " me" : ""}${r.id === ENTRY || r.id === MAJORITY ? " bench" : ""}`} style={{ gridTemplateColumns: "1fr auto 48px" }}>
          <span className="nm"><i className="dot" style={cvar(r.id)} />{r.name}</span>
          <span className="rc">{fmtRec(r.rec)}</span>
          <span className="pc">{fmtPct(r.rec)}</span>
        </div>
      ))}
    </div>
    <p className="hint">{counted} of {week.games.length} games counted, including who&apos;s covering in games still being played.</p>
  </>);
}

function GameRow({ game: g, open, hidden, as, live, onMore, onPicked }: {
  game: Game; open: boolean; hidden: boolean; as: string; live?: LiveGame; onMore(): void; onPicked(): void;
}) {
  const { season, me, run } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const entry = hidden ? null : entryPick(g, ids);
  const sp = hidden ? null : split(g, ids);
  const my = grade(g.picks[me], g.result);
  const started = !!live && live.state !== "pre";
  const finished = !!g.result || live?.state === "post";
  const coverTeam = g.result ?? (started ? live!.covering : null);

  const team = (t: string, isHome: boolean) => {
    const backers = season.players.filter((p) => g.picks[p.id] === t);
    const mine = g.picks[as] === t;
    const pickerName = season.players.find((p) => p.id === as)?.name;
    const score = started ? (isHome ? live!.homeScore : live!.awayScore) : null;
    const cls = ["team", mine && "mine", coverTeam === t && "cover", finished && coverTeam && coverTeam !== "PUSH" && coverTeam !== t && "out"].filter(Boolean).join(" ");
    return (
      <button className={cls} disabled={!open || !g.id} aria-pressed={mine}
        aria-label={`${t} ${spreadFor(t, g.fav, g.spread)}${score !== null ? `, ${score} points` : ""}${mine ? ", your pick" : ""}${coverTeam === t ? (finished ? ", covered" : ", covering") : ""}`}
        onClick={async () => {
          if (mine || !g.id) return;
          const wasBlank = !g.picks[as];
          if (await run("setPick", g.id, as, t) && wasBlank) onPicked();
        }}>
        <span className="nm">
          {entry === t && <b className="entry-ck" title="Group entry">✓</b>}
          {isHome && <span className="at">@</span>}{t}
        </span>
        <span className="who">
          {/* While others are hidden, your pick gets a label instead of a lone chip. */}
          {hidden && mine && <span className={`chip mine-tag${chipClass(as)}`} style={{ background: colorOf(as) }}>{as === me ? "Your pick" : `${pickerName}'s pick`}</span>}
          {backers.filter((p) => !(hidden && p.id === as)).map((p) => (
            <span key={p.id} className={`chip${chipClass(p.id)}${p.id === as ? " me" : ""}`} style={{ background: colorOf(p.id) }} title={p.name}>{p.initial}</span>
          ))}
        </span>
        <span className="sc">{score ?? ""}</span>
        <span className="ln">{spreadFor(t, g.fav, g.spread)}</span>
      </button>
    );
  };

  const head = live?.state === "in" ? <span className="clock"><span className="live-dot" />{clock(live.detail)}</span>
    : finished ? <span className="fin">Final</span>
    : live?.start ? <span>{timeFmt.format(new Date(live.start))}</span>
    : <span>Game {g.num}</span>;

  return (
    <article className="sb" data-num={g.num} data-blank={g.picks[as] ? undefined : "1"}>
      <button className="stat" onClick={onMore} aria-label={`Details for ${g.away} at ${g.home}`}>
        {head}
        <small>{g.league}{sp ? ` · ${sp}` : ""}</small>
        {my && <span className={`tag res ${my === "W" ? "win" : my === "L" ? "loss" : "signal"}`}>{my === "P" ? "Push" : my === "W" ? "Win" : "Loss"}</span>}
        {g.entryOverride && <span className="tag accent res">Override</span>}
      </button>
      <div>{team(g.away, false)}{team(g.home, true)}</div>
    </article>
  );
}

export function GameSheet({ game: g, week, live, hidden, onClose }: { game: Game; week: Week; live?: LiveGame; hidden?: boolean; onClose(): void }) {
  const { season, isAdmin, run } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const maj = majority(g, ids), entry = entryPick(g, ids);
  const rows: [string, string, string | null, string?][] = [
    ...season.players.map((p) => [p.id, p.name, g.picks[p.id] ?? null, hidden && !g.picks[p.id] ? "hidden until everyone locks" : undefined] as [string, string, string | null, string?]),
    ...(hidden ? [] : [
    [MAJORITY, "Majority", maj, maj ? undefined : Object.keys(g.picks).length ? "no majority" : undefined],
    [ENTRY, "Entry", entry, g.entryOverride ? "override" : !maj && entry ? "Claude breaks the tie" : undefined],
    ] as [string, string, string | null, string?][]),
  ];
  const opts = useMemo(() => [g.away, g.home], [g.away, g.home]);

  return (
    <Sheet title={`${g.away} at ${g.home}`} onClose={onClose}>
      <p style={{ fontSize: ".88rem", color: "var(--muted)", margin: "0 0 8px" }}>
        {labelOf(week)} · Game {g.num} · {g.league} · {g.line} · {g.fav} favoured
        {live?.start && live.state === "pre" ? ` · ${dayFmt.format(new Date(live.start))}, ${timeFmt.format(new Date(live.start))}` : ""}
      </p>
      {live && live.state !== "pre" && (
        <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: "1.05rem" }}>
          {g.away} {live.awayScore} · {g.home} {live.homeScore} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: ".9rem" }}>· {live.detail}
          {live.covering && ` · ${live.covering === "PUSH" ? "push" : `${live.covering} ${live.state === "post" ? "covered" : "covering"}`}`}</span>
        </p>
      )}
      <div className="list">
        {rows.map(([id, name, pick, note]) => {
          const gr = grade(pick, g.result);
          return (
            <div className="kv" key={id}>
              <span className="lab"><i className="dot" style={cvar(id)} />{name}</span>
              <span>{pick ?? <span style={{ color: "var(--faint)" }}>—</span>}{note && <span style={{ fontSize: ".8rem", color: "var(--faint)" }}> · {note}</span>}</span>
              {gr ? <span className={`tag ${gr === "W" ? "win" : gr === "L" ? "loss" : "signal"}`}>{gr === "W" ? "Win" : gr === "L" ? "Loss" : "Push"}</span> : <span />}
            </div>
          );
        })}
      </div>
      {isAdmin && g.id && (<>
        <p className="eyebrow" style={{ marginTop: 18 }}>Result: who covered</p>
        <div className="pills">
          {opts.map((t) => <button key={t} className="pill" aria-pressed={g.result === t} onClick={() => run("setResult", g.id!, t)}>{t}</button>)}
          <button className="pill" aria-pressed={g.result === "PUSH"} onClick={() => run("setResult", g.id!, "PUSH")}>Push</button>
          {g.result && <button className="pill" onClick={() => run("setResult", g.id!, null)}>Clear</button>}
        </div>
        <p className="eyebrow" style={{ marginTop: 18 }}>Entry pick</p>
        <div className="pills">
          <button className="pill" aria-pressed={!g.entryOverride} onClick={() => run("setOverride", g.id!, null)}>Automatic</button>
          {opts.map((t) => <button key={t} className="pill" aria-pressed={g.entryOverride === t} onClick={() => run("setOverride", g.id!, t)}>Force {t}</button>)}
        </div>
        <p className="hint">Results record themselves when games go final. Enter Claude&apos;s picks (or fix anyone&apos;s) with &quot;Picking as&quot; while the week is open.</p>
      </>)}
    </Sheet>
  );
}
