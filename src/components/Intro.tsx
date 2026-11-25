"use client";
import { useEffect, useState } from "react";

const SEEN = "bake.intro.v1";

/** Two-second clip over the login screen. Plays once per device; a tap skips it. Never blocks sign-in:
 *  the login renders underneath, and the clip removes itself on end, on error, or after a hard timeout. */
export function Intro() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN)) return;
      localStorage.setItem(SEEN, "1");
    } catch { return; } // no storage (private mode): skip it instead of replaying on every visit
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
