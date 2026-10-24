// Email pick reminders: when to send one, and what it says. Pure; the sending lives in reminderJob.ts.
// (Phone-notification timing lives in reminders.ts.)
import { fmtDeadline, fmtTime, softDeadline } from "./deadline";

/** Default lead: the reminder goes out this many minutes before picks are due (60 → 11 AM CT / noon ET). */
export const REMINDER_LEAD_MINUTES = 60;

/** When the reminder goes out for a week: `leadMin` before picks are due (the lock minus the grace period). */
export const remindAt = (lockIso: string, graceMin: number, leadMin: number) =>
  new Date(Date.parse(softDeadline(lockIso, graceMin)) - leadMin * 60000).toISOString();

/** True when a reminder should go now: the reminder time has passed, the week hasn't locked, and none was sent yet. */
export function reminderDue(w: { deadline: string | null; remindedAt: string | null }, graceMin: number, leadMin: number, now = Date.now()) {
  if (!w.deadline || w.remindedAt) return false;
  return now >= Date.parse(remindAt(w.deadline, graceMin, leadMin)) && now < Date.parse(w.deadline);
}

export interface Reminder { name: string; picked: number; total: number; label: string; lockIso: string; graceMin: number; url: string; now?: number }

/** Subject and body for one person. Plain text plus a minimal HTML twin. */
export function reminderEmail(r: Reminder) {
  const due = softDeadline(r.lockIso, r.graceMin);
  const late = (r.now ?? Date.now()) >= Date.parse(due);
  const left = r.total - r.picked;
  const status = left === r.total ? `You haven't made any picks yet.`
    : left > 0 ? `You've picked ${r.picked} of ${r.total}; ${left} to go.`
    : `All ${r.total} are picked, but you haven't locked them.`;
  const when = late
    ? `Picks were due at ${fmtTime(due)}. They lock for good at ${fmtTime(r.lockIso)}.`
    : `Picks are due ${fmtDeadline(due)} and lock at ${fmtTime(r.lockIso)}.`;
  const subject = late ? `${r.label}: picks were due, lock at ${fmtTime(r.lockIso)}` : `${r.label}: picks due ${fmtTime(due)} today`;
  const text = `${r.name},\n\n${status}\n${when}\n\nMake and lock your picks: ${r.url}\n\n— BAKE Pool`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<p>${esc(r.name)},</p><p>${esc(status)}<br>${esc(when)}</p><p><a href="${r.url}">Make and lock your picks</a></p><p>— BAKE Pool</p>`;
  return { subject, text, html };
}
