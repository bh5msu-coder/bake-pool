import { describe, expect, it } from "vitest";
import { remindAt, reminderDue, reminderEmail } from "./emailReminders";

const lock = "2026-10-29T19:30:00.000Z"; // Thu Oct 29, 2:30 PM CDT; picks due noon CT

describe("reminder timing", () => {
  it("goes out 60 minutes before picks are due: 11 AM CT, noon ET", () => {
    expect(remindAt(lock, 150, 60)).toBe("2026-10-29T16:00:00.000Z");
  });
  it("is due from the reminder time until the lock, once", () => {
    const w = { deadline: lock, remindedAt: null };
    expect(reminderDue(w, 150, 60, Date.parse("2026-10-29T15:59:00Z"))).toBe(false);
    expect(reminderDue(w, 150, 60, Date.parse("2026-10-29T16:00:00Z"))).toBe(true);
    expect(reminderDue(w, 150, 60, Date.parse("2026-10-29T18:00:00Z"))).toBe(true); // missed run still sends before the lock
    expect(reminderDue(w, 150, 60, Date.parse("2026-10-29T19:30:00Z"))).toBe(false);
    expect(reminderDue({ ...w, remindedAt: "2026-10-29T16:00:30Z" }, 150, 60, Date.parse("2026-10-29T16:15:00Z"))).toBe(false);
    expect(reminderDue({ deadline: null, remindedAt: null }, 150, 60)).toBe(false);
  });
  it("follows the clock change", () => {
    expect(remindAt("2026-11-12T20:30:00.000Z", 150, 60)).toBe("2026-11-12T17:00:00.000Z"); // 11 AM CST
  });
});

describe("reminder email", () => {
  const base = { name: "Kevin", total: 30, label: "Week 8", lockIso: lock, graceMin: 150, url: "https://bake-pool.vercel.app", now: Date.parse("2026-10-29T16:00:00Z") };
  it("says how many picks are left and when they're due", () => {
    const m = reminderEmail({ ...base, picked: 22 });
    expect(m.subject).toBe("Week 8: picks due 12:00 PM CT today");
    expect(m.text).toContain("You've picked 22 of 30; 8 to go.");
    expect(m.text).toContain("Picks are due Thu, Oct 29, 12:00 PM CT and lock at 2:30 PM CT.");
    expect(m.text).toContain("https://bake-pool.vercel.app");
  });
  it("nudges people who picked everything but didn't lock, and people with nothing", () => {
    expect(reminderEmail({ ...base, picked: 30 }).text).toContain("All 30 are picked, but you haven't locked them.");
    expect(reminderEmail({ ...base, picked: 0 }).text).toContain("You haven't made any picks yet.");
  });
  it("changes tone after the due time, during the grace period", () => {
    const m = reminderEmail({ ...base, picked: 10, now: Date.parse("2026-10-29T17:30:00Z") });
    expect(m.subject).toBe("Week 8: picks were due, lock at 2:30 PM CT");
    expect(m.text).toContain("Picks were due at 12:00 PM CT. They lock for good at 2:30 PM CT.");
  });
});
