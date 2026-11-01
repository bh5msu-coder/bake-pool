import "server-only";
// Finds who hasn't locked their picks for the open week and reminds them with a phone notification (web push).
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRACE_MINUTES, nextDeadline, softDeadline } from "./deadline";
import { REMINDER_LEAD_MINUTES, reminderDue, reminderEmail } from "./emailReminders";
import { notify } from "./notify";

export interface Recipient { id: string; name: string; picked: number; total: number }
export interface ReminderPlan {
  weekId: number; label: string; lock: string; due: string; remindAt: boolean; remindedAt: string | null;
  recipients: Recipient[];
  /** People who won't get one and why (already locked). */
  skipped: { id: string; name: string; reason: string }[];
}

async function settings(sb: SupabaseClient) {
  const { data } = await sb.from("settings").select("key,value").in("key", ["season", "grace_minutes", "reminder_lead_minutes"]);
  const get = (k: string) => data?.find((r) => r.key === k)?.value;
  return {
    season: Number(get("season") ?? new Date().getFullYear()),
    grace: Number(get("grace_minutes") ?? GRACE_MINUTES),
    lead: Number(get("reminder_lead_minutes") ?? REMINDER_LEAD_MINUTES),
  };
}

/** The open week (first with games and a future lock) and who still needs to lock. Null when there's no open week. */
export async function planReminders(sb: SupabaseClient, now = new Date()): Promise<ReminderPlan | null> {
  const s = await settings(sb);
  type WeekRow = { id: number; week: number; label: string | null; deadline: string | null; reminded_at: string | null; games: { count: number }[] };
  const { data: rows } = await sb.from("weeks").select("id,week,label,deadline,reminded_at,games(count)").eq("season", s.season).order("week");
  const week = ((rows ?? []) as WeekRow[]).find((w) => (w.games?.[0]?.count ?? 0) > 0 && (!w.deadline || Date.parse(w.deadline) > now.getTime()));
  if (!week?.deadline) return null;

  const [{ data: players }, { data: locks }, { data: picks }] = await Promise.all([
    sb.from("players").select("id,name,kind,sort").eq("kind", "human").order("sort"),
    sb.from("pick_locks").select("player_id").eq("week_id", week.id),
    sb.from("picks").select("player_id, games!inner(week_id)").eq("games.week_id", week.id),
  ]);
  const total = week.games[0].count;
  const locked = new Set((locks ?? []).map((l) => l.player_id as string));
  const counts = new Map<string, number>();
  for (const p of picks ?? []) counts.set(p.player_id as string, (counts.get(p.player_id as string) ?? 0) + 1);

  const recipients: Recipient[] = [], skipped: ReminderPlan["skipped"] = [];
  for (const p of players ?? []) {
    if (locked.has(p.id)) skipped.push({ id: p.id, name: p.name, reason: "locked" });
    else recipients.push({ id: p.id, name: p.name, picked: counts.get(p.id) ?? 0, total });
  }
  return {
    weekId: week.id, label: week.label ?? `Week ${week.week}`, lock: week.deadline, due: softDeadline(week.deadline, s.grace),
    remindAt: reminderDue({ deadline: week.deadline, remindedAt: week.reminded_at }, s.grace, s.lead, now.getTime()),
    remindedAt: week.reminded_at, recipients, skipped,
  };
}

export interface SendResult { id: string; name: string; ok: boolean; error?: string }

/** Sends every recipient a phone notification. A person with notifications off on every device counts as failed. */
export async function sendReminders(sb: SupabaseClient, plan: ReminderPlan, url: string, graceMin: number, now = Date.now()): Promise<SendResult[]> {
  const out: SendResult[] = [];
  for (const r of plan.recipients) {
    const m = reminderEmail({ name: r.name, picked: r.picked, total: r.total, label: plan.label, lockIso: plan.lock, graceMin, url, now });
    const body = m.text.split("\n\n")[1].replace("\n", " ");
    try {
      const sent = await notify(sb, [r.id], { title: m.subject, body, url: "/", tag: `due-${plan.weekId}` });
      out.push(sent ? { id: r.id, name: r.name, ok: true } : { id: r.id, name: r.name, ok: false, error: "notifications not turned on" });
    } catch (e) { out.push({ id: r.id, name: r.name, ok: false, error: (e as Error).message }); }
  }
  return out;
}

/** A sample reminder to one player's phones, so notifications can be checked without waiting for a Thursday. */
export async function sendTestReminder(sb: SupabaseClient, to: { id: string; name: string }, url: string, graceMin: number) {
  const nextLock = nextDeadline().toISOString();
  const plan: ReminderPlan = {
    weekId: 0, label: "Test week", lock: nextLock, due: softDeadline(nextLock, graceMin), remindAt: false, remindedAt: null,
    recipients: [{ id: to.id, name: to.name, picked: 22, total: 30 }], skipped: [],
  };
  return sendReminders(sb, plan, url, graceMin);
}

export async function markReminded(sb: SupabaseClient, weekId: number, at = new Date()) {
  const { error } = await sb.from("weeks").update({ reminded_at: at.toISOString() }).eq("id", weekId);
  if (error) throw new Error(error.message);
}
