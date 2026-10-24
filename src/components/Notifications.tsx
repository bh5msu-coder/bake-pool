"use client";
import { useEffect, useState } from "react";
import { useApp } from "./store";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "needs-home" | "blocked" | "off" | "on";

/** Menu section: turn phone notifications on or off for this device, and send a test. */
export function Notifications() {
  const { demo, toast } = useApp();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState(ios && !standalone ? "needs-home" : "unsupported"); return;
    }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    navigator.serviceWorker.getRegistration("/sw.js").then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off")).catch(() => setState("off"));
  }, []);

  async function turnOn() {
    if (demo) return toast("Not available in demo mode.", true);
    if (!KEY) return toast("Notifications aren't set up on the server yet.", true);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if ((await Notification.requestPermission()) !== "granted") { setState("blocked"); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save this device.");
      setState("on"); toast("Notifications on for this device");
    } catch (e) { toast((e as Error).message, true); } finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration("/sw.js"))?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally { setBusy(false); }
  }

  async function test() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    toast(res.ok ? (j.sent ? "Test sent" : "No devices to send to") : j.error ?? "Couldn't send", !res.ok || !j.sent);
  }

  return (<>
    <p className="eyebrow" style={{ marginTop: 18 }}>Notifications</p>
    {state === "on" ? (
      <div className="row" style={{ gap: 8 }}>
        <span style={{ flex: 1, fontSize: ".9rem" }}>On for this device</span>
        <button className="btn" onClick={test}>Send a test</button>
        <button className="btn" onClick={turnOff} disabled={busy}>Turn off</button>
      </div>
    ) : state === "off" ? (
      <button className="cta ghost" onClick={turnOn} disabled={busy}>{busy ? "Turning on…" : "Turn on notifications"}</button>
    ) : (
      <p className="hint" style={{ marginTop: 0 }}>
        {state === "needs-home" ? "On iPhone, add BAKE Pool to your Home Screen first (Share → Add to Home Screen), open it from there, then turn notifications on here."
          : state === "blocked" ? "Notifications are blocked for this site. Allow them in your browser or phone settings, then come back."
          : state === "unsupported" ? "This browser can't show notifications." : "Checking…"}
      </p>
    )}
    <p className="hint">Thursday reminders when your picks are due and you haven&apos;t locked, plus a last call 45 minutes before.</p>
  </>);
}
