// Deadlines are Thursday 12:00 PM US Central, whatever the server's timezone.
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

/** The first Thursday noon Central strictly after `from`. */
export function nextDeadline(from = new Date(), weekday = 4, hour = 12): Date {
  const local = new Date(from.getTime() + tzOffset(from) * 60000); // wall clock as UTC fields
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour));
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  if (d.getTime() <= local.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return new Date(d.getTime() - tzOffset(d) * 60000);
}

export function fmtDeadline(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " CT";
}

export function timeLeft(iso: string, now = Date.now()) {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}
