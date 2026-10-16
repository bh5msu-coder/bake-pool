"use client";
import { useState } from "react";

export function Login({ error }: { error?: string | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [msg, setMsg] = useState<string | null>(error ?? null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setMsg(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setState("sent");
    else { setState("idle"); setMsg(json.error ?? "Couldn't send the link. Try again."); }
  }

  return (
    <main className="login">
      <div className="card">
        <h1>BAKE Pool</h1>
        <p className="hint" style={{ marginTop: 0 }}>Brad · Andrew · Kevin · Eric</p>
        {state === "sent" ? (
          <p style={{ lineHeight: 1.5 }}>Check <b>{email}</b> for a sign-in link. Open it on this device. You&apos;ll stay signed in after that.</p>
        ) : (
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="email">YOUR EMAIL</label>
              <input id="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {msg && <p className="warn err" style={{ marginTop: 12 }}>{msg}</p>}
            <button className="cta" style={{ marginTop: 14 }} disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
