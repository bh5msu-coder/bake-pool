// BAKE Pool service worker: shows phone notifications and opens the app when one is tapped.
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
