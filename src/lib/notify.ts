import "server-only";
// Phone notifications over web push. Subscriptions live in push_subs; dead ones (the phone unsubscribed or the app
// was removed) are deleted when Apple/Google answer 404 or 410.
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { reminderPlan, type Note } from "./reminders";
import type { Season } from "./scoring";

export type { Note };

function configure() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("Notifications aren't set up yet (VAPID keys missing).");
  webpush.setVapidDetails("mailto:bh5msu@gmail.com", pub, priv);
}

/** Sends to every device of these players. Returns how many devices it reached. */
export async function notify(sb: SupabaseClient, players: string[], note: Note): Promise<number> {
  if (!players.length) return 0;
  configure();
  const { data } = await sb.from("push_subs").select("endpoint,p256dh,auth").in("player_id", players);
  let sent = 0;
  await Promise.all((data ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(note), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
    }
  }));
  return sent;
}

/** Sends a note once per key (a second call with the same key does nothing). */
async function once(sb: SupabaseClient, key: string, players: string[], note: Note) {
  const { error } = await sb.from("push_log").insert({ key });
  if (error) return 0; // already sent
  try {
    return await notify(sb, players, note);
  } catch (e) {
    await sb.from("push_log").delete().eq("key", key); // not sent after all: try again next run
    throw e;
  }
}

/** Sends whatever reminders are due now (each once). Run every 15 minutes on Thursdays. */
export async function thursdayReminders(sb: SupabaseClient, season: Season, now = Date.now()) {
  const plan = reminderPlan(season, now);
  let sent = 0;
  for (const p of plan) sent += await once(sb, p.key, p.players, p.note);
  return { due: plan.map((p) => p.key), sent };
}
