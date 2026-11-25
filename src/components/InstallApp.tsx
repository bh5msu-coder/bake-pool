"use client";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Chrome and Edge fire this once, often before any screen has mounted, so it's caught here and kept.
let saved: InstallEvent | null = null;
const waiting = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); saved = e as InstallEvent; waiting.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { saved = null; waiting.forEach((f) => f()); });
}

/** "Install app" where the browser can do it in one click (Chrome, Edge), otherwise the steps for this browser.
 *  Shows nothing once the app is already running as an installed app. */
export function InstallApp() {
  const [, bump] = useState(0);
  const [how, setHow] = useState<"hidden" | "ios" | "safari" | "other">("hidden");

  useEffect(() => {
    const f = () => bump((n) => n + 1);
    waiting.add(f);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|FxiOS|CriOS/.test(ua);
    setHow(standalone ? "hidden" : ios ? "ios" : safari ? "safari" : "other");
    return () => { waiting.delete(f); };
  }, []);

  if (how === "hidden") return null;
  if (saved) {
    const install = async () => { const e = saved; if (!e) return; await e.prompt(); await e.userChoice; saved = null; bump((n) => n + 1); };
    return <button className="cta ghost gap-s" onClick={install}>Install app</button>;
  }
  return (
    <p className="hint">
      {how === "ios" ? "Install: tap Share, then Add to Home Screen."
        : how === "safari" ? "Install on a Mac: in Safari, choose File, then Add to Dock."
        : "Install on a computer: in Chrome or Edge, use the install button in the address bar."}
    </p>
  );
}
