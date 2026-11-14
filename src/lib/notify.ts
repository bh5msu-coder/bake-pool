import "server-only";
// Phone notifications over web push. Subscriptions live in push_subs; dead ones (the phone unsubscribed or the app
// was removed) are deleted when Apple/Google answer 404 or 410.
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { reminderPlan, type Note } from "./reminders";
import { finalNotes, resultNotes, wants, type FinalGame, type NoteKind } from "./resultNotes";
import { humans, type Season } from "./scoring";

export type { Note };

function configure() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("Notifications aren't set up yet (VAPID keys missing).");
  webpush.setVapidDetails("mailto:bh5msu@gmail.com", pub, priv);
}

type Sub = { endpoint: string; p256dh: string; auth: string; prefs?: Record<string, unknown> | null };

/**
 * Sends to every device of these players. Returns how many devices it reached.
 * With a `kind`, devices that switched that kind of notification off are skipped.
 */
export async function notify(sb: SupabaseClient, players: string[], note: Note, kind?: NoteKind): Promise<number> {
  if (!players.length) return 0;
  configure();
  let subs: Sub[];
  const withPrefs = await sb.from("push_subs").select("endpoint,p256dh,auth,prefs").in("player_id", players);
  if (withPrefs.error) {
    // The prefs column arrives with migration 0019; until then everyone gets the default-on kinds only.
    const plain = await sb.from("push_subs").select("endpoint,p256dh,auth").in("player_id", players);
    subs = (plain.data ?? []) as Sub[];
  } else subs = (withPrefs.data ?? []) as Sub[];
  if (kind) subs = subs.filter((s) => wants(s.prefs, kind));
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
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
async function once(sb: SupabaseClient, key: string, players: string[], note: Note, kind?: NoteKind) {
  const { error } = await sb.from("push_log").insert({ key });
  if (error) return 0; // already sent
  try {
    return await notify(sb, players, note, kind);
  } catch (e) {
    await sb.from("push_log").delete().eq("key", key); // not sent after all: try again next run
    throw e;
  }
}

/** Sends the result notifications that are due (each once): picks revealed, week recap, eliminator outcome. */
export async function resultPushes(sb: SupabaseClient, season: Season, finals: FinalGame[] = [], now = Date.now()) {
  const ids = humans(season.players).map((p) => p.id);
  const plan = [...resultNotes(season, now), ...finals.flatMap((g) => finalNotes(g, ids))];
  let sent = 0;
  for (const p of plan) sent += await once(sb, p.key, p.players, p.note, p.kind);
  return { due: plan.length, sent };
}

/** Sends whatever reminders are due now (each once). Run every 15 minutes on Thursdays. */
export async function thursdayReminders(sb: SupabaseClient, season: Season, now = Date.now()) {
  const plan = reminderPlan(season, now);
  let sent = 0;
  for (const p of plan) sent += await once(sb, p.key, p.players, p.note);
  return { due: plan.map((p) => p.key), sent };
}
