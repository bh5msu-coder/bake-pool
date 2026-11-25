"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { colorOf } from "@/lib/players";
import { Intro } from "./Intro";

type Who = { id: string; name: string; initial: string };

/** Tap your name to sign in. No email, no PIN. */
export function Login({ error }: { error?: string | null }) {
  const [players, setPlayers] = useState<Who[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(error ?? null);

  useEffect(() => {
    fetch("/api/enter").then((r) => r.json()).then((j) => {
      if (j.error) setMsg(j.error); else setPlayers(j.players);
    }).catch(() => setMsg("Couldn't reach the server. Check your connection."));
  }, []);

  async function enter(p: Who) {
    setBusy(p.id); setMsg(null);
    const res = await fetch("/api/enter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player: p.id }) });
    if (res.ok) { window.location.reload(); return; } // stay on the screen the link pointed at
    const j = await res.json().catch(() => ({}));
    setBusy(null); setMsg(j.error ?? "Couldn't sign in. Try again.");
  }

  return (
    <main className="login">
      <Intro />
      <div className="card">
        <h1>BAKE <em>Pool</em></h1>
        <p className="hint flush">Who&apos;s picking?</p>
        <div className="who-grid">
          {(players ?? []).map((p) => (
            <button key={p.id} className="who-btn" disabled={!!busy} onClick={() => enter(p)}>
              <span className="avatar" style={{ "--who": colorOf(p.id) } as CSSProperties}>{p.initial}</span>
              {busy === p.id ? "Signing in…" : p.name}
            </button>
          ))}
          {!players && !msg && <p className="hint">Loading…</p>}
        </div>
        {msg && <p className="warn err gap-s">{msg}</p>}
      </div>
    </main>
  );
}
