"use client";
import { useMemo, useState } from "react";
import { fmtDeadline, timeLeft } from "@/lib/deadline";
import {
  ENTRY, entryLines, labelOf, entryPick, fmtRec, grade, humans, isGraded, isOpen, majority, MAJORITY, record, split,
  type Game, type Week,
} from "@/lib/scoring";
import { spreadFor, teamVars } from "@/lib/teams";
import { Header, Sheet } from "./ui";
import { useApp } from "./store";

type Show = "all" | "todo" | "ties";

export function WeekTab() {
  const { season, me, isAdmin, weekIdx, setWeekIdx } = useApp();
  const week = season.weeks[weekIdx];
  const [as, setAs] = useState(me);
  const [show, setShow] = useState<Show>("all");
  const [detail, setDetail] = useState<Game | null>(null);
  const ids = humans(season.players).map((p) => p.id);

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
        {isAdmin ? "Open the menu (your initial, top right) and tap Refresh lines to pull this week from the sheet." : "Brad will load this week's lines from John's sheet soon."}
      </div></main>
    </>);
  }

  const open = isOpen(week);
  const graded = isGraded(week);
  const games = week.games.filter((g) =>
    show === "todo" ? !g.picks[as] : show === "ties" ? split(g, ids) === "2-2" : true);
  const live = detail && week.games.find((g) => g.id === detail.id && g.num === detail.num);

  const strip = graded ? (
    <div className="strip">
      {[...season.players.map((p) => [p.id, p.name.toUpperCase()]), [MAJORITY, "MAJ"], [ENTRY, "ENTRY"]].map(([id, lab]) => {
        const r = record(week.games, id, ids);
        return <div key={id} className={id === me ? "me" : ""}><div className="who">{lab}</div><div className="val num">{fmtRec(r)}</div></div>;
      })}
    </div>
  ) : null;

  return (<>
    <Header title={labelOf(week)} sub={open ? "OPEN FOR PICKS" : graded ? (week.games.every((g) => g.result) ? "FINAL" : "IN PROGRESS") : "LOCKED"} right={nav} strip={strip} />
    <main className="wrap">
      {open && <Status week={week} as={as} />}
      {!open && <ClosedSummary week={week} />}

      <section>
        <div className="row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
          <div className="pills" role="group" aria-label="Show">
            {(["all", "todo", "ties"] as Show[]).map((s) => (
              <button key={s} className="pill" aria-pressed={show === s} onClick={() => setShow(s)}>
                {s === "all" ? "All" : s === "todo" ? "To pick" : "2-2 splits"}
                <small>{s === "all" ? week.games.length : s === "todo" ? week.games.filter((g) => !g.picks[as]).length
                  : week.games.filter((g) => split(g, ids) === "2-2").length}</small>
              </button>
            ))}
          </div>
          {isAdmin && open && (
            <label className="row mono" style={{ fontSize: ".72rem", color: "var(--faint)", marginLeft: "auto", gap: 6 }}>
              AS
              <select value={as} onChange={(e) => setAs(e.target.value)} className="btn" style={{ minHeight: 36 }}>
                {season.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="games">
          {games.map((g) => <GameCard key={g.id ?? g.num} game={g} open={open} as={as} onMore={() => setDetail(g)} />)}
          {!games.length && <div className="empty"><b>Nothing here</b>{show === "todo" ? "You've picked every game." : "Every game has a majority."}</div>}
        </div>
      </section>
    </main>
    {live && <GameSheet game={live} week={week} onClose={() => setDetail(null)} />}
  </>);
}

function Status({ week, as }: { week: Week; as: string }) {
  const { season, toast } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const left = week.deadline ? timeLeft(week.deadline) : null;
  const mine = week.games.filter((g) => g.picks[as]).length;
  const entry = entryLines(week, ids);
  const missing = week.games.reduce((n, g) => n + ids.filter((id) => !g.picks[id]).length, 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.text);
      toast(`Copied ${entry.lines.length} lines`);
    } catch {
      toast("Couldn't reach the clipboard. Long-press to copy instead.", true);
    }
  }

  return (
    <section className="status">
      <div className="row">
        <div>
          <div className="big num">{left ?? "—"}</div>
          <div className="lab">{week.deadline ? `UNTIL ${fmtDeadline(week.deadline).toUpperCase()}` : "NO DEADLINE SET"}</div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: "right" }}>
          <div className="big num">{mine}/{week.games.length}</div>
          <div className="lab">{as === "claude" ? "CLAUDE'S PICKS" : "YOUR PICKS"}</div>
        </div>
      </div>
      <div className="progress">
        {season.players.map((p) => {
          const n = week.games.filter((g) => g.picks[p.id]).length;
          return <div key={p.id} className={n === week.games.length ? "done" : ""}><span>{p.name.toUpperCase()}</span>{n}/{week.games.length}</div>;
        })}
      </div>
      <button className={`cta${missing ? " ghost" : ""}`} onClick={copy} disabled={entry.blanks > 0}>
        {entry.blanks ? `Entry: ${entry.blanks} game${entry.blanks > 1 ? "s" : ""} still blank`
          : missing ? `Copy entry anyway · ${missing} picks missing` : `Copy entry · ${entry.lines.length} lines`}
      </button>
      <p className="hint" style={{ margin: 0 }}>
        The entry goes with the majority (3 of 4). On a 2-2 split, Claude&apos;s pick decides. Brad can override any game.
      </p>
    </section>
  );
}

function ClosedSummary({ week }: { week: Week }) {
  const { season, me } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const done = week.games.filter((g) => g.result).length;
  if (!done) return <section><p className="hint" style={{ margin: 0 }}>Picks are locked. Results will show here as Brad enters them.</p></section>;
  const mine = record(week.games, me, ids), entry = record(week.games, ENTRY, ids);
  return (
    <section className="status">
      <div className="row">
        <div><div className="big num">{fmtRec(entry)}</div><div className="lab">ENTRY · {done}/{week.games.length} GRADED</div></div>
        <div className="spacer" />
        <div style={{ textAlign: "right" }}><div className="big num">{fmtRec(mine)}</div><div className="lab">YOU</div></div>
      </div>
      {week.winnings > 0 && <div className="warn" style={{ color: "var(--win)", background: "var(--win-soft)" }}>Won ${week.winnings.toFixed(0)} this week.</div>}
    </section>
  );
}

function GameCard({ game: g, open, as, onMore }: { game: Game; open: boolean; as: string; onMore(): void }) {
  const { season, me, run } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const entry = entryPick(g, ids);
  const sp = split(g, ids);
  const my = grade(g.picks[me], g.result);

  const side = (team: string, isHome: boolean) => {
    const backers = season.players.filter((p) => g.picks[p.id] === team);
    const mine = g.picks[as] === team;
    return (
      <button
        className={`side${mine ? " mine" : ""}${g.result === team ? " covered" : ""}`}
        style={teamVars(team)}
        disabled={!open || !g.id}
        aria-pressed={mine}
        aria-label={`${team} ${spreadFor(team, g.fav, g.spread)}${mine ? ", your pick" : ""}`}
        onClick={() => { if (!mine && g.id) void run("setPick", g.id, as, team); }}
      >
        <span>
          <span className="tn">{isHome ? "@ " : ""}{team}</span>
          <span className="sp num" style={{ display: "block" }}>{spreadFor(team, g.fav, g.spread)}
            {g.result === team && <b style={{ color: "var(--win)" }}> · COVERED</b>}</span>
        </span>
        <span className="who">
          {backers.map((p) => (
            <span key={p.id} className={`chip${p.id === as ? " me" : ""}${p.kind === "bot" ? " bot" : ""}`} title={p.name}>{p.initial}</span>
          ))}
          {entry === team && <span className="chip entry" title="Group entry">ENTRY</span>}
        </span>
      </button>
    );
  };

  return (
    <article className="game">
      <div className="meta">
        <span className="num">G{String(g.num).padStart(2, "0")}</span><span>{g.league}</span><span>{g.line}</span>
        {sp === "2-2" && <span className="tag signal">2-2</span>}
        {g.entryOverride && <span className="tag accent">OVERRIDE</span>}
        {my && <span className={`tag ${my === "W" ? "win" : my === "L" ? "loss" : "signal"}`}>{my === "P" ? "PUSH" : my}</span>}
        <button className="more" onClick={onMore} aria-label={`Details for game ${g.num}`}>⋯</button>
      </div>
      <div className="sides">{side(g.away, false)}{side(g.home, true)}</div>
    </article>
  );
}

export function GameSheet({ game: g, week, onClose }: { game: Game; week: Week; onClose(): void }) {
  const { season, isAdmin, run } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const maj = majority(g, ids), entry = entryPick(g, ids);
  const rows: [string, string | null, string?][] = [
    ...season.players.map((p) => [p.name, g.picks[p.id] ?? null] as [string, string | null]),
    ["Majority", maj, maj ? undefined : Object.keys(g.picks).length ? "no majority" : undefined],
    ["Entry", entry, g.entryOverride ? "override" : !maj && entry ? "Claude breaks the tie" : undefined],
  ];
  const opts = useMemo(() => [g.away, g.home], [g.away, g.home]);

  return (
    <Sheet title={`${g.away} at ${g.home}`} onClose={onClose}>
      <p className="mono" style={{ fontSize: ".74rem", color: "var(--muted)", margin: "0 0 8px" }}>
        {labelOf(week).toUpperCase()} · GAME {g.num} · {g.league} · {g.line} · {g.fav.toUpperCase()} FAVOURED
      </p>
      <div className="list">
        {rows.map(([name, pick, note]) => {
          const gr = grade(pick, g.result);
          return (
            <div className="kv" key={name}>
              <span className="lab">{name.toUpperCase()}</span>
              <span>{pick ?? <span style={{ color: "var(--faint)" }}>—</span>}{note && <span className="mono" style={{ fontSize: ".66rem", color: "var(--faint)" }}> · {note}</span>}</span>
              {gr ? <span className={`tag ${gr === "W" ? "win" : gr === "L" ? "loss" : "signal"}`}>{gr}</span> : <span />}
            </div>
          );
        })}
      </div>
      {isAdmin && g.id && (<>
        <p className="eyebrow" style={{ marginTop: 18 }}>Result · who covered</p>
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
        <p className="hint">Enter Claude&apos;s picks (or fix anyone&apos;s) with the AS selector above the games while the week is open.</p>
      </>)}
    </Sheet>
  );
}
