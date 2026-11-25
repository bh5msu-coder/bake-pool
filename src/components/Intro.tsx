"use client";
import { useEffect, useState } from "react";

const SEEN = "bake.intro.v1";

/** Two-second clip shown each time the app is opened (once per browser session), signed in or not. A tap skips
 *  it. Never blocks anything: the app loads underneath, and the clip removes itself on end, on error, or after a
 *  hard timeout. */
export function Intro() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN)) return; // a reload or a sign-in redirect: don't play it twice
      sessionStorage.setItem(SEEN, "1");
    } catch { return; } // no storage: skip it instead of replaying on every reload
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 4000); // the clip never loaded or never fired "ended"
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;
  const done = () => { setLeaving(true); setTimeout(() => setShow(false), 320); };
  return (
    <button type="button" className={`intro${leaving ? " out" : ""}`} onClick={done} aria-label="Skip intro">
      <video src="/intro.mp4" autoPlay muted playsInline preload="auto" onEnded={done} onError={() => setShow(false)} />
    </button>
  );
}
