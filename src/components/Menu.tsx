"use client";
import { useState } from "react";
import { labelOf } from "@/lib/scoring";
import { Sheet } from "./ui";
import { useApp } from "./store";

type Plan = {
  action: "none" | "update" | "create" | "conflict"; week: number; label: string; message: string;
  games: { num: number; league: string; away: string; home: string; line: string; problem?: string }[];
  changes?: { num: number; from: string; to: string }[];
};

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

/** Local datetime-input value for an ISO instant, in the device's timezone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function Menu() {
  const { season, me, isAdmin, demo, setMenu, signOut } = useApp();
  const p = season.players.find((x) => x.id === me);
  return (
    <Sheet title="Menu" onClose={() => setMenu(false)}>
      <div className="kv"><span className="lab">Signed in</span><span>{p?.name ?? me}{demo && " (demo)"}</span>
        <button className="link" onClick={signOut}>Sign out</button></div>
      {isAdmin && <AdminTools />}
      <p className="hint">Tip: on iPhone, tap Share → Add to Home Screen to use this like an app.</p>
    </Sheet>
  );
}

function AdminTools() {
  const { season, weekIdx, demo, run, toast, reload } = useApp();
  const week = season.weeks[weekIdx];
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [pushed, setPushed] = useState<string | null>(null);

  async function act(label: string, fn: () => Promise<void>) {
    if (demo) return toast("Not available in demo mode.", true);
    setBusy(label);
    try { await fn(); } catch (e) { toast((e as Error).message, true); } finally { setBusy(null); }
  }
  const check = () => act("check", async () => setPlan((await post<{ plan: Plan }>("/api/lines/sync")).plan));
  const apply = (replace = false) => act("apply", async () => {
    if (replace && !confirm(`Replace ${plan!.label}'s games with the sheet? Every pick already made for that week will be erased.`)) return;
    await post("/api/lines/sync", { apply: true, replace });
    toast(plan!.action === "create" ? `${plan!.label} created` : "Lines updated");
    setPlan(null);
    await reload();
  });
  const pushNow = () => act("push", async () => {
    const r = (await post<{ pushed: { week: string; cells: number; games: number; unmatched: string[] }[] }>("/api/sheet/push", { weekId: week!.id })).pushed[0];
    setPushed(`${r.week}: wrote ${r.cells} cells for ${r.games} games.` + (r.unmatched.length ? ` Couldn't find on the sheet: ${r.unmatched.join(", ")}.` : ""));
  });

  const sync = (mode: "import" | "export") => act(mode, async () => {
    if (mode === "import" && !confirm("Take every pick that's in the sheet for the open week? Where the sheet and the app differ, the sheet's pick replaces the app's (locked players excepted).")) return;
    const r = await post<{ message: string; skipped: string[] }>("/api/sheet/sync", { mode });
    setPushed(r.message + (r.skipped.length ? ` Skipped: ${r.skipped.join("; ")}.` : ""));
    await reload();
  });

  const problems = plan?.games.filter((g) => g.problem) ?? [];
  return (<>
    <p className="eyebrow" style={{ marginTop: 20 }}>Lines from John&apos;s sheet</p>
    <button className="cta ghost" onClick={check} disabled={!!busy}>{busy === "check" ? "Reading the sheet…" : "Refresh lines"}</button>
    {plan && (
      <div className="card" style={{ marginTop: 10 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 600 }}>{plan.message}</p>
        {problems.length > 0 && <div className="warn err" style={{ marginBottom: 8 }}>
          {problems.map((g) => <div key={g.num}>G{g.num} {g.away} at {g.home} ({g.line || "no line"}): {g.problem}</div>)}
        </div>}
        {plan.changes?.map((c) => <div key={c.num} className="mono" style={{ fontSize: ".76rem" }}>G{c.num}: {c.from} → {c.to}</div>)}
        {(plan.action === "create" || plan.action === "conflict") && (
          <div className="mono" style={{ fontSize: ".72rem", color: "var(--muted)", maxHeight: 180, overflowY: "auto" }}>
            {plan.games.map((g) => <div key={g.num}>{String(g.num).padStart(2, "0")} {g.league.padEnd(4)} {g.away} at {g.home} · {g.line}</div>)}
          </div>
        )}
        {(plan.action === "create" || plan.action === "update") &&
          <button className="cta" style={{ marginTop: 10 }} disabled={!!busy || problems.length > 0} onClick={() => apply()}>
            {plan.action === "create" ? `Create ${plan.label}` : "Update lines"}</button>}
        {plan.action === "conflict" &&
          <button className="cta danger" style={{ marginTop: 10 }} disabled={!!busy || problems.length > 0} onClick={() => apply(true)}>Replace {plan.label}</button>}
      </div>
    )}
    <p className="hint">The app also checks the Converter tab every 30 minutes, so a new week shows up on its own once John posts the lines. New weeks are due Thursday at noon CT and lock at 2:30 PM CT.</p>

    <p className="eyebrow" style={{ marginTop: 22 }}>Picks ↔ Google Sheet</p>
    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
      <button className="cta ghost" style={{ flex: 1 }} onClick={() => sync("import")} disabled={!!busy}>{busy === "import" ? "Importing…" : "Import from sheet"}</button>
      <button className="cta ghost" style={{ flex: 1 }} onClick={() => sync("export")} disabled={!!busy}>{busy === "export" ? "Exporting…" : "Export to sheet"}</button>
    </div>
    <p className="hint" style={{ marginTop: 0 }}>Until picks lock, the open week also syncs both ways every 10 minutes: whichever side changed last wins
      (the app if both did). Locked players&apos; picks always come from the app.</p>
    {week?.id && <button className="cta ghost" onClick={pushNow} disabled={!!busy}>{busy === "push" ? "Writing…" : `Push ${labelOf(week)} to sheet now`}</button>}
    {pushed && <div className="card" style={{ marginTop: 10, fontSize: ".85rem" }}>{pushed}</div>}
    <p className="hint">Happens automatically 5 minutes after picks lock (Thursday 2:30 PM CT). Picks, eliminator votes and results go into
      that week&apos;s rows; the sheet&apos;s own formulas are left alone.</p>

    {week?.id && (<>
      <p className="eyebrow" style={{ marginTop: 22 }}>{labelOf(week)} settings</p>
      <div className="field"><label htmlFor="dl">Picks lock at (your time)</label>
        <input id="dl" type="datetime-local" defaultValue={toLocalInput(week.deadline)} key={`dl${week.id}`}
          onBlur={(e) => e.target.value && run("updateWeek", week.id!, { deadline: new Date(e.target.value).toISOString() })} /></div>
      <div className="row" style={{ gap: 10 }}>
        <div className="field" style={{ flex: 1 }}><label htmlFor="won">Won $</label>
          <input id="won" type="number" inputMode="decimal" min={0} defaultValue={week.winnings} key={`w${week.id}`}
            onBlur={(e) => run("updateWeek", week.id!, { winnings: Math.max(0, Number(e.target.value) || 0) })} /></div>
      </div>
    </>)}

    <div className="field" style={{ marginTop: 22 }}><label htmlFor="grace">Grace period (minutes before the lock that picks are due)</label>
      <input id="grace" type="number" inputMode="numeric" min={0} max={1440} step={15} defaultValue={season.graceMinutes}
        onBlur={(e) => run("setSetting", "grace_minutes", Math.min(1440, Math.max(0, Math.round(Number(e.target.value) || 0))))} /></div>
    <p className="hint">150 = due at noon, locked at 2:30 PM. Anyone can still pick during the grace period.</p>

    <div className="field" style={{ marginTop: 22 }}><label htmlFor="sfee">Season entry $ (paid up front)</label>
      <input id="sfee" type="number" inputMode="decimal" min={0} defaultValue={season.seasonFee}
        onBlur={(e) => run("setSetting", "season_fee", Math.max(0, Number(e.target.value) || 0))} /></div>
    <Ledger />

    <p className="eyebrow" style={{ marginTop: 22 }}>Sign-in emails</p>
    {season.players.filter((p) => p.kind === "human").map((p) => (
      <div className="field" key={p.id}><label htmlFor={`em-${p.id}`}>{p.name}</label>
        <input id={`em-${p.id}`} type="email" autoComplete="off" placeholder="name@example.com" value={emails[p.id] ?? ""}
          onChange={(e) => setEmails({ ...emails, [p.id]: e.target.value })}
          onBlur={(e) => e.target.value && run("setPlayerEmail", p.id, e.target.value).then((ok) => ok && toast(`Saved ${p.name}'s email`))} />
      </div>
    ))}
    <p className="hint">Sign-in is just tapping your name; each email ties a name to its account. Saved emails aren&apos;t shown here;
      type one to replace it.</p>
  </>);
}

/** One-off money that isn't a weekly entry or eliminator buy-back. */
function Ledger() {
  const { season, run } = useApp();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"paid" | "won">("paid");
  const add = () => {
    const n = Math.abs(Number(amount));
    if (!label.trim() || !n) return;
    void run("setSetting", "ledger", [...season.ledger, { label: label.trim(), amount: kind === "paid" ? -n : n }]);
    setLabel(""); setAmount("");
  };
  return (<>
    <p className="eyebrow" style={{ marginTop: 22 }}>Other money</p>
    {season.ledger.map((e, i) => (
      <div className="kv" key={i}>
        <span className="lab">{e.amount < 0 ? "Paid" : "Won"}</span>
        <span>{e.label} · ${Math.abs(e.amount)}</span>
        <button className="link" onClick={() => run("setSetting", "ledger", season.ledger.filter((_, j) => j !== i))}>Remove</button>
      </div>
    ))}
    <div className="row" style={{ gap: 8, alignItems: "end" }}>
      <div className="field" style={{ flex: 2 }}><label htmlFor="lg-l">What</label>
        <input id="lg-l" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Eliminator buy-in" /></div>
      <div className="field" style={{ flex: 1 }}><label htmlFor="lg-a">$</label>
        <input id="lg-a" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
    </div>
    <div className="row" style={{ marginTop: 8 }}>
      <div className="pills">
        <button className="pill" aria-pressed={kind === "paid"} onClick={() => setKind("paid")}>Paid</button>
        <button className="pill" aria-pressed={kind === "won"} onClick={() => setKind("won")}>Won</button>
      </div>
      <span className="spacer" />
      <button className="btn on" onClick={add} disabled={!label.trim() || !Number(amount)}>Add</button>
    </div>
    <p className="hint">The season entry, weekly winnings and eliminator buy-backs are counted automatically. Use this for anything else.</p>
  </>);
}
