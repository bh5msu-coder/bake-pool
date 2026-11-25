"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const SEEN = "bake.intro.v1";

/** Two-second clip shown each time the app is opened (once per browser session), signed in or not. A tap skips it.
 *
 *  It stays invisible until the browser has actually started playing it. Browsers that refuse to autoplay (iPhone
 *  Low Power Mode, Safari set to never auto-play) would otherwise show a frozen first frame with a play button over
 *  the whole app; there the clip is dropped and the app is simply shown. It never blocks anything: the app loads
 *  underneath, and the clip removes itself on end, on error, or when it doesn't start or finish in time. */
export function Intro() {
  const [phase, setPhase] = useState<"off" | "waiting" | "playing" | "leaving">("off");
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN)) return; // a reload or a sign-in redirect: don't play it twice
      sessionStorage.setItem(SEEN, "1");
    } catch { return; } // no storage: skip it instead of replaying on every reload
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    setPhase("waiting");
  }, []);

  // Start it by hand: React doesn't write the `muted` attribute, and Safari only autoplays a clip it sees as muted.
  useEffect(() => {
    if (phase !== "waiting") return;
    const v = video.current;
    if (!v) return;
    v.muted = true; v.defaultMuted = true;
    let live = true;
    v.play().catch(() => { if (live) setPhase("off"); }); // autoplay refused: no clip, no play button
    const t = setTimeout(() => setPhase((p) => (p === "waiting" ? "off" : p)), 3000); // slow connection: don't hold a blank wait
    return () => { live = false; clearTimeout(t); };
  }, [phase]);

  const done = useCallback(() => setPhase((p) => (p === "playing" ? "leaving" : p)), []);
  useEffect(() => {
    if (phase === "playing") { const t = setTimeout(done, 4000); return () => clearTimeout(t); } // stalled mid-clip
    if (phase === "leaving") { const t = setTimeout(() => setPhase("off"), 320); return () => clearTimeout(t); }
  }, [phase, done]);

  if (phase === "off") return null;
  return (
    <button type="button" className={`intro ${phase}`} onClick={done} aria-label="Skip intro" tabIndex={phase === "playing" ? 0 : -1}>
      <video ref={video} src="/intro.mp4" muted playsInline preload="auto" disablePictureInPicture
        onPlaying={() => setPhase((p) => (p === "waiting" ? "playing" : p))} onEnded={done} onError={() => setPhase("off")} />
    </button>
  );
}
