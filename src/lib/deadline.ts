// A week's `deadline` is the hard lock: Thursday 2:30 PM US Central (CDT or CST, following the clock change), whatever
// the server's timezone. Picks are due earlier, at the soft deadline (noon), and the gap between is a grace period.
const TZ = "America/Chicago";

/** Offset of America/Chicago from UTC at a given instant, in minutes (e.g. -300 for CDT). */
function tzOffset(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - at.getTime()) / 60000);
}

export const DEADLINE = { weekday: 4, hour: 14, minute: 30 } as const;
/** Minutes between the soft deadline (picks due) and the hard lock. Noon → 2:30 PM. */
export const GRACE_MINUTES = 150;

export type Phase = "open" | "grace" | "locked";

/** When picks are due: the hard lock minus the grace period. */
export const softDeadline = (lockIso: string, graceMin: number) => new Date(Date.parse(lockIso) - graceMin * 60000).toISOString();

/** Before the soft deadline, in the grace period, or locked. A week without a deadline stays open. */
export function phaseOf(lockIso: string | null, graceMin: number, now = Date.now()): Phase {
  if (!lockIso) return "open";
  const lock = Date.parse(lockIso);
  if (now >= lock) return "locked";
  return now >= lock - graceMin * 60000 ? "grace" : "open";
}

/** The first deadline (default Thursday 2:30 PM Central) strictly after `from`. */
export function nextDeadline(from = new Date(), weekday: number = DEADLINE.weekday, hour: number = DEADLINE.hour, minute: number = DEADLINE.minute): Date {
  const local = new Date(from.getTime() + tzOffset(from) * 60000); // wall clock as UTC fields
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute));
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  if (d.getTime() <= local.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return new Date(d.getTime() - tzOffset(d) * 60000);
}

export function fmtDeadline(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " CT";
}

/** "2:30 PM CT" */
export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " CT";
}

/** "Thu 12:00 PM CT", for tight spots. */
export function fmtShort(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " CT";
}

export function timeLeft(iso: string, now = Date.now()) {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}
