"use client";
import { elimSummary, elimTeam, humans, isOpen, labelOf, usedElimTeams, type Week } from "@/lib/scoring";
import { spreadFor, teamVars } from "@/lib/teams";
import { Header } from "./ui";
import { useApp } from "./store";

/** NFL teams on the week's slate, biggest underdogs first: the likeliest to lose. */
function candidates(w: Week) {
  return w.games.filter((g) => g.league === "NFL").flatMap((g) => [
    { team: g.away, opp: `at ${g.home}`, line: spreadFor(g.away, g.fav, g.spread), dog: g.fav !== g.away, spread: g.spread },
    { team: g.home, opp: `vs ${g.away}`, line: spreadFor(g.home, g.fav, g.spread), dog: g.fav !== g.home, spread: g.spread },
  ]).sort((a, b) => Number(b.dog) - Number(a.dog) || (a.dog ? b.spread - a.spread : a.spread - b.spread));
}

export function ElimTab() {
  const { season, me, isAdmin, run, weekIdx, setWeekIdx } = useApp();
  const ids = humans(season.players).map((p) => p.id);
  const week = season.weeks[weekIdx];
  const sum = elimSummary(season);

  const nav = (
    <div className="wknav">
      <button className="iconbtn" disabled={weekIdx <= 0} onClick={() => setWeekIdx(weekIdx - 1)} aria-label="Previous week">‹</button>
      <button className="iconbtn" disabled={weekIdx >= season.weeks.length - 1} onClick={() => setWeekIdx(weekIdx + 1)} aria-label="Next week">›</button>
    </div>
  );
  if (!week) return (<><Header title="Eliminator" right={nav} /><main className="wrap"><div className="empty"><b>No weeks yet</b></div></main></>);

  const open = isOpen(week);
  const team = elimTeam(week.elim, ids);
  const used = usedElimTeams(season, week.week);
  const cands = candidates(week);
  const cand = cands.find((c) => c.team === team);
  const votes = Object.values(week.elim.picks).filter(Boolean).length;
  const tied = !team && votes > 0;

  return (<>
    <Header title="Eliminator" sub={`${labelOf(week).toUpperCase()} · ${sum.alive ? `${sum.livesLeft} ${sum.livesLeft === 1 ? "LIFE" : "LIVES"} LEFT` : "ELIMINATED"}`} right={nav} />
    <main className="wrap">
      <section>
        <div className="ticket" style={teamVars(team)}>
          <div className="face">
            <div className="kicker">{labelOf(week).toUpperCase()} · GROUP PICK TO LOSE</div>
            <div className="team">{team ?? (tied ? "Tied vote" : "No pick yet")}</div>
            <div className="vs">{cand ? `${cand.opp} · ${cand.line}` : tied ? "Brad breaks the tie below" : `${votes}/${ids.length} votes in`}</div>
          </div>
          <div className="perf" />
          <div className="stub">
            <span className="lives" aria-label={`${sum.livesLeft} of ${sum.lives} lives left`}>
              {Array.from({ length: sum.lives }, (_, i) => <i key={i} className={i < sum.livesLeft ? "on" : ""} />)}
            </span>
            <span>{week.elim.outcome === "survived" ? "SURVIVED" : week.elim.outcome === "died" ? "THEY WON · LIFE LOST" : open ? "VOTING OPEN" : "LOCKED"}</span>
          </div>
        </div>
        <p className="hint">Pick an NFL team you think loses outright. If they win, the group loses a life. Each team can only be used once.
          {" "}The group starts with 1 life; each buy-back adds one for ${season.elimBuybackCost}.</p>
        {isAdmin && (
          <div className="row" style={{ marginTop: 12 }}>
            <span className="mono" style={{ fontSize: ".72rem", color: "var(--faint)" }}>BUY-BACKS · ${season.elimBuybackCost} EACH</span>
            <span className="spacer" />
            <button className="iconbtn" aria-label="Remove a buy-back" disabled={season.elimBuybacks <= 0}
              onClick={() => run("setSetting", "elim_buybacks", season.elimBuybacks - 1)}>−</button>
            <b className="num" style={{ minWidth: 24, textAlign: "center" }}>{season.elimBuybacks}</b>
            <button className="iconbtn" aria-label="Add a buy-back"
              onClick={() => run("setSetting", "elim_buybacks", season.elimBuybacks + 1)}>+</button>
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow">Votes</p>
        <div className="progress">
          {humans(season.players).map((p) => (
            <div key={p.id} className={week.elim.picks[p.id] ? "done" : ""}><span>{p.name.toUpperCase()}</span>{week.elim.picks[p.id] ?? "—"}</div>
          ))}
        </div>
      </section>

      {(open || isAdmin) && week.id && (
        <section>
          <p className="eyebrow">{open ? "Your vote · biggest underdogs first" : "Fix the group pick"}</p>
          <div className="games">
            {cands.map((c) => {
              const burned = used.has(c.team);
              const mine = week.elim.picks[me] === c.team;
              const backers = humans(season.players).filter((p) => week.elim.picks[p.id] === c.team);
              return (
                <button key={c.team} className={`cand${mine ? " mine" : ""}`} style={{ ...teamVars(c.team), opacity: burned ? 0.45 : 1 }}
                  disabled={burned || !open}
                  onClick={() => run("setElimPick", week.id!, me, mine ? null : c.team)}>
                  <span><span className="t" style={burned ? { textDecoration: "line-through" } : undefined}>{c.team}</span>
                    <span className="o" style={{ display: "block" }}>{c.opp} · {c.line}{burned ? " · already used" : ""}</span></span>
                  <span className="row" style={{ gap: 3 }}>{backers.map((p) => <span key={p.id} className={`chip${p.id === me ? " me" : ""}`}>{p.initial}</span>)}</span>
                </button>
              );
            })}
            {!cands.length && <p className="hint">No NFL games on this week&apos;s slate.</p>}
          </div>
          {isAdmin && (<>
            <p className="eyebrow" style={{ marginTop: 18 }}>Admin · group pick</p>
            <div className="field" style={{ marginTop: 0 }}>
              <select value={week.elim.override ?? ""} onChange={(e) => run("setElimWeek", week.id!, { override_team: e.target.value || null })}>
                <option value="">Follow the vote</option>
                {cands.filter((c) => !used.has(c.team)).map((c) => <option key={c.team} value={c.team}>Force {c.team}</option>)}
              </select>
            </div>
            <p className="eyebrow" style={{ marginTop: 14 }}>Admin · outcome</p>
            <div className="pills">
              {(["survived", "died"] as const).map((o) => (
                <button key={o} className="pill" aria-pressed={week.elim.outcome === o}
                  onClick={() => run("setElimWeek", week.id!, { outcome: week.elim.outcome === o ? null : o })}>
                  {o === "survived" ? "They lost · survived" : "They won · life lost"}
                </button>
              ))}
            </div>
          </>)}
        </section>
      )}

      <section>
        <p className="eyebrow">Season so far</p>
        <div className="list">
          {sum.rows.filter((r) => r.team).map((r) => (
            <div key={r.week} className="st" style={teamVars(r.team)}>
              <span className="rk num">{r.short}</span>
              <span className="nm">{r.team}</span>
              <span />
              <span className={`tag ${r.outcome === "died" ? "loss" : r.outcome === "survived" ? "win" : ""}`} style={{ justifySelf: "end" }}>
                {r.outcome === "died" ? "LIFE LOST" : r.outcome === "survived" ? "SURVIVED" : "PENDING"}
              </span>
            </div>
          ))}
        </div>
        {sum.burned.length > 0 && (<>
          <p className="eyebrow" style={{ marginTop: 18 }}>Used · can&apos;t pick again</p>
          <div className="burned">{sum.burned.map((b) => <span key={b.team}>{b.team} · {b.short}</span>)}</div>
        </>)}
      </section>
    </main>
  </>);
}
