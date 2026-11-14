// BAKE Pool service worker.
// 1. Phone notifications: shows them, and opens the right screen when one is tapped.
// 2. Offline: keeps the app's own files (pages, scripts, styles, fonts, icons) so it still opens with no signal.
//    Data is never served from here: API and Supabase requests always go to the network, and the app itself
//    keeps the last season it loaded and says "showing the last update" when offline.
const CACHE = "bake-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Opening the app: try the network first (always the newest version), fall back to the saved copy.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); }
        return res;
      }).catch(() => caches.match("/").then((hit) => hit || Response.error())),
    );
    return;
  }

  // Built files have a unique name per version, so a saved copy is always right: use it, else fetch and save.
  const fixed = url.pathname.startsWith("/_next/static/") || /\.(png|ico|svg|woff2?)$/.test(url.pathname);
  if (!fixed) return;
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});

self.addEventListener("push", (event) => {
  let note = { title: "BAKE Pool", body: "", url: "/" };
  try { note = { ...note, ...event.data.json() }; } catch { /* plain text or empty */ }
  event.waitUntil(self.registration.showNotification(note.title, {
    body: note.body, tag: note.tag, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: note.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
