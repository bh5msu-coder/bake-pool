"use client";
// The Week screen's three acts: the Slip (before lock), the live view (games on) and the board (who took which side).
import type { ReactNode } from "react";
import { coverMargin, coverText } from "@/lib/cover";
import { chipClass, colorOf, cvar } from "@/lib/players";
import { ENTRY, entryPick, fmtRec, grade, humans, labelOf, record, split, type Game, type Week } from "@/lib/scoring";
import type { LiveGame } from "@/lib/scores";
import { shortName, spreadFor, teamVars } from "@/lib/teams";
import { IconMore } from "./icons";
import { useApp } from "./store";
import type { LiveMap } from "./useLive";

export type Act = "picks" | "live" | "recap";
export interface Section { key: string; title: string; live?: boolean; games: Game[] }

/** ESPN writes "15:00 - 3rd"; a scoreboard reads better as "3rd 15:00". */
export const clock = (d: string) => { const m = /^(.+?) - (.+)$/.exec(d); return m ? `${m[2]} ${m[1]}` : d; };
/** The team's name, swapped for its short spelling on phone-width screens. Screen readers always get the full name. */
function TeamName({ team }: { team: string }) {
  const short = shortName(team);
  if (short === team) return <>{team}</>;
  return <><span className="nm-full">{team}</span><span className="nm-short" aria-label={team}>{short}</span></>;
}

const kickFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Picks · Live · Recap. The week chooses one on its own; this lets you look at the others. */
export function ActSwitch({ act, can, onChange }: { act: Act; can: Record<Act, boolean>; onChange(a: Act): void }) {
  const tabs: [Act, string][] = [["picks", "Picks"], ["live", "Live"], ["recap", "Recap"]];
  return (
    <div className="subtabs acts" role="tablist" aria-label="Week view">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={act === k} disabled={!can[k]} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

/** Act 1: one line per game, tap a side. Records sit beside the spread; the middle button opens the game. */
export function Slip({ secs, as, canPick, live, onMore, onPicked }: {
  secs: Section[]; as: string; canPick: boolean; live: LiveMap; onMore(g: Game): void; onPicked(num: number): void;
}) {
  const { run } = useApp();
  const side = (g: Game, t: string, isHome: boolean) => {
    const mine = g.picks[as] === t, l = live.get(g.num);
    const rec = (isHome ? l?.homeRec : l?.awayRec) ?? null;
    return (
      <button className="pk-side" style={teamVars(t)} disabled={!canPick || !g.id} aria-pressed={mine}
        aria-label={`${t} ${spreadFor(t, g.fav, g.spread)}${rec ? `, record ${rec}` : ""}${mine ? ", your pick" : ""}`}
        onClick={async () => {
          if (mine || !g.id) return;
          const wasBlank = !g.picks[as];
          if (await run("setPick", g.id, as, t) && wasBlank) onPicked(g.num);
        }}>
        <span className="nm">{isHome && <span className="at">@</span>}{t}</span>
        <span className="ln">{spreadFor(t, g.fav, g.spread)}{rec && <small>{rec}</small>}</span>
      </button>
    );
  };
  return (<>
    {secs.map((sec) => (
      <section key={sec.key} className="card slip">
        <h2 className="slot"><span>{sec.title}</span><span>{sec.games.filter((g) => g.picks[as]).length} / {sec.games.length}</span></h2>
        <div className="pk-list">{sec.games.map((g) => (
          <div key={g.id ?? g.num} className={`pk${g.picks[as] ? " set" : ""}`} data-num={g.num} data-blank={g.picks[as] ? undefined : "1"}>
            {side(g, g.away, false)}
            <button className="pk-more" onClick={() => onMore(g)} aria-label={`Details for ${g.away} at ${g.home}`}><IconMore className="icon sm" /></button>
            {side(g, g.home, true)}
          </div>
        ))}</div>
      </section>
    ))}
  </>);
}

/** The slip's running count, pinned above the tab bar on phones. `action` is the lock button once every game is picked. */
export function SlipDock({ picked, total, due, action }: { picked: number; total: number; due: string | null; action?: ReactNode }) {
  const left = total - picked;
  const next = () => document.querySelector<HTMLElement>('.pk[data-blank="1"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
  return (
    <div className="slip-dock mob-only">
      <div className="r"><b className="num">{picked} / {total}</b><span>{left ? `${left} to go` : "All picked"}{due ? ` · ${due}` : ""}</span></div>
      <div className="meter" aria-hidden><i style={{ width: `${(picked / Math.max(1, total)) * 100}%` }} /></div>
      {left ? <button className="cta" onClick={next}>Next unpicked game</button> : action}
    </div>
  );
}

/** The desktop slip: every pick made so far, in game order. */
export function SlipList({ week, as }: { week: Week; as: string }) {
  const picked = week.games.filter((g) => g.picks[as]);
  return (
    <div className="card slip-list">
      <p className="eyebrow">Your slip · {labelOf(week)}</p>
      {picked.length ? (
        <ul>{picked.map((g) => <li key={g.num}><span>{g.picks[as]}</span><b>{spreadFor(g.picks[as], g.fav, g.spread)}</b></li>)}</ul>
      ) : <p className="hint flush">Tap a team to add it. Your picks collect here.</p>}
    </div>
  );
}

const resTag = (r: ReturnType<typeof grade>) =>
  r ? <span className={`tag ${r === "W" ? "win" : r === "L" ? "loss" : "signal"}`}>{r === "W" ? "Win" : r === "L" ? "Loss" : "Push"}</span> : null;

/** Act 2: games being played, closest to the line first, then what is done and what is still to come. */
export function LiveAct({ week, live, visible, onMore }: { week: Week; live: LiveMap; visible: boolean; onMore(g: Game): void }) {
  const { season, me } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  // The group entry once picks are revealed; until then, your own pick.
  const sideOf = (g: Game) => (visible ? entryPick(g, ids) : g.picks[me]) ?? null;
  const whose = visible ? "Entry" : "You";
  const state = (g: Game) => (g.result ? "post" : live.get(g.num)?.state ?? "pre");
  const margin = (g: Game, l?: LiveGame) => {
    const t = sideOf(g);
    return t && l && l.awayScore !== null && l.homeScore !== null ? coverMargin(g, t, l.awayScore, l.homeScore) : null;
  };
  const playing = week.games.filter((g) => state(g) === "in")
    .map((g) => ({ g, l: live.get(g.num)!, m: margin(g, live.get(g.num)) }))
    .sort((a, b) => Math.abs(a.m ?? 99) - Math.abs(b.m ?? 99) || a.g.num - b.g.num);
  const finals = week.games.filter((g) => state(g) === "post");
  const later = week.games.filter((g) => state(g) === "pre")
    .sort((a, b) => (live.get(a.num)?.start ?? "").localeCompare(live.get(b.num)?.start ?? "") || a.num - b.num);

  const teamRow = (g: Game, l: LiveGame, t: string, isHome: boolean) => (
    <div className={`t${sideOf(g) === t ? " ours" : ""}`} style={teamVars(t)}>
      <span className="nm">{isHome && <span className="at">@</span>}<TeamName team={t} /></span>
      {visible && (
        <span className="who">{season.players.filter((p) => g.picks[p.id] === t).map((p) => (
          <span key={p.id} className={`chip${chipClass(p.id)}${p.id === me ? " me" : ""}`} style={{ background: colorOf(p.id) }} title={p.name}>{p.initial}</span>
        ))}</span>
      )}
      <span className="sc">{isHome ? l.homeScore : l.awayScore}</span>
      <span className="ln">{spreadFor(t, g.fav, g.spread)}</span>
    </div>
  );

  return (<>
    {playing.length ? (<>
      <h2 className="sec-h live"><span className="live-dot" />Swing games<span className="n">closest to the line first</span></h2>
      <div className="games">
        {playing.map(({ g, l, m }) => {
          const sp = visible ? split(g, ids) : null, t = sideOf(g);
          return (
            <article key={g.num} className="card lv">
              <button className="meta" onClick={() => onMore(g)} aria-label={`Details for ${g.away} at ${g.home}`}>
                <span className="live-dot" /><span>{clock(l.detail)}</span>{sp && <span>Humans {sp}</span>}
                {m !== null && <span className={`tag res ${m > 0 ? "win" : m < 0 ? "loss" : "signal"}`}>{m > 0 ? "Covering" : m < 0 ? "Behind" : "Push"}</span>}
              </button>
              {teamRow(g, l, g.away, false)}{teamRow(g, l, g.home, true)}
              {m !== null && t && (
                <div className="cover">
                  <div className="track" aria-hidden><i className={m >= 0 ? "pos" : "neg"} style={{ width: `${Math.min(Math.abs(m) / 14, 1) * 50}%` }} /></div>
                  <div className="r"><span>{whose}: {t} {spreadFor(t, g.fav, g.spread)}</span><b className={m > 0 ? "up" : m < 0 ? "down" : ""}>{coverText(m)}</b></div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>) : (
      <div className="empty tight"><b>No games on right now</b>{later.length ? "The next kickoffs are listed below." : "Every game is final."}</div>
    )}
    {finals.length > 0 && (<>
      <h2 className="sec-h">Final<span className="n">{finals.length}</span></h2>
      <div className="card rows">
        {finals.map((g) => {
          const l = live.get(g.num), t = sideOf(g), cov = g.result ?? l?.covering ?? null;
          return (
            <button key={g.num} className="frow" onClick={() => onMore(g)}>
              <span className="mu">{g.away}{l && l.awayScore !== null ? <b> {l.awayScore}</b> : ""} · {g.home}{l && l.homeScore !== null ? <b> {l.homeScore}</b> : ""}</span>
              {t && <small>{whose}: {t}</small>}
              {resTag(grade(t ?? undefined, cov))}
            </button>
          );
        })}
      </div>
    </>)}
    {later.length > 0 && (<>
      <h2 className="sec-h">Still to come<span className="n">{later.length}</span></h2>
      <div className="card rows">
        {later.map((g) => {
          const l = live.get(g.num), t = sideOf(g);
          return (
            <button key={g.num} className="frow" onClick={() => onMore(g)}>
              <span className="mu">{g.away} at {g.home}</span>
              {t && <small>{whose}: {t} {spreadFor(t, g.fav, g.spread)}</small>}
              <span className="when">{l?.start ? kickFmt.format(new Date(l.start)) : `Game ${g.num}`}</span>
            </button>
          );
        })}
      </div>
    </>)}
  </>);
}

/** The whole week in one grid: a row per game, a column for the entry and each picker. The filled slot is the side they took. */
export function Board({ week, games, onMore }: { week: Week; games: Game[]; onMore(g: Game): void }) {
  const { season, me } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const cols = [{ id: ENTRY, name: "Entry", initial: "" }, ...season.players.map((p) => ({ id: p.id, name: p.name, initial: p.initial }))];
  const pickOf = (g: Game, id: string) => (id === ENTRY ? entryPick(g, ids) : g.picks[id]) ?? null;
  const slot = (g: Game, pick: string | null, t: string) => {
    if (pick !== t) return <i />;
    const r = grade(pick, g.result);
    return <i className={r === "W" ? "w" : r === "L" ? "l" : r === "P" ? "p" : "on"} />;
  };
  return (
    <div className="card board-card">
      <p className="eyebrow">{labelOf(week)} board</p>
      <div className="tablewrap" tabIndex={0} role="region" aria-label={`${labelOf(week)} board`}>
        <table className="bb">
          <thead><tr><th scope="col">Game</th>{cols.map((c) => (
            <th key={c.id} scope="col" className={c.id === me ? "me" : ""} title={c.name}>
              {c.id === ENTRY ? "Entry" : <><i className="dot" style={cvar(c.id)} /><span className="long">{c.name}</span><span className="short">{c.initial}</span></>}
            </th>
          ))}</tr></thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.num}>
                <th scope="row"><button onClick={() => onMore(g)} aria-label={`Details for ${g.away} at ${g.home}`}>
                  <span><span className="tn"><TeamName team={g.away} /></span><b>{spreadFor(g.away, g.fav, g.spread)}</b></span>
                  <span><span className="tn"><span className="at">@</span><TeamName team={g.home} /></span><b>{spreadFor(g.home, g.fav, g.spread)}</b></span>
                </button></th>
                {cols.map((c) => {
                  const pick = pickOf(g, c.id), r = grade(pick ?? undefined, g.result);
                  return (
                    <td key={c.id} className={c.id === me ? "me" : ""}
                      aria-label={pick ? `${c.name}: ${pick}${r ? `, ${r === "W" ? "covered" : r === "L" ? "did not cover" : "push"}` : ""}` : `${c.name}: no pick`}>
                      <span className="bcell">{slot(g, pick, g.away)}{slot(g, pick, g.home)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th scope="row">{labelOf(week)}</th>{cols.map((c) => {
            const rec = record(games, c.id, ids);
            return <td key={c.id} className={`${c.id === me ? "me " : ""}${c.id === ENTRY ? (rec.w > rec.l ? "up" : rec.l > rec.w ? "down" : "") : ""}`}>{fmtRec(rec)}</td>;
          })}</tr></tfoot>
        </table>
      </div>
      <p className="hint">Top slot is the away team, bottom slot the home team. Green covered, red did not.</p>
    </div>
  );
}
