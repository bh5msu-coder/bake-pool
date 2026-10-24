// Which Thursday phone reminders are due, worked out from the season (pure, so it can be tested).
import { softDeadline } from "./deadline";
import { groupLocked, humans, isOpen, labelOf, pickedCount, type Season } from "./scoring";

export interface Note { title: string; body: string; url?: string; tag?: string }

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export interface Planned { key: string; players: string[]; note: Note }

/**
 * Which Thursday reminders are due now for the open week (pure; sent once each by key):
 * - from 3 hours before picks are due: anyone who hasn't locked (and hasn't picked every game, or hasn't locked them).
 * - from 45 minutes before: a last call to anyone still not locked.
 * - from 30 minutes before until an hour after: if Claude doesn't have a pick in every game, Brad gets an alert
 *   (the Thursday routine runs on his Mac and may not have run).
 */
export function reminderPlan(season: Season, now = Date.now()): Planned[] {
  const week = season.weeks.find((w) => w.deadline && isOpen(w, now) && w.games.length > 0);
  if (!week?.deadline || !week.id) return [];
  const dueIso = softDeadline(week.deadline, season.graceMinutes);
  const until = Date.parse(dueIso) - now;
  const total = week.games.length, label = labelOf(week), at = fmtTime(dueIso);
  const notLocked = groupLocked(week, season.players) ? [] : humans(season.players).filter((p) => !week.locks?.includes(p.id));
  const out: Planned[] = [];
  if (until <= 3 * 3600e3 && until > 0) {
    for (const p of notLocked) {
      const left = total - pickedCount(week, p.id);
      out.push({ key: `due3h:${week.id}:${p.id}`, players: [p.id], note: {
        title: `${label} picks are due today`, url: "/", tag: `due-${week.id}`,
        body: left > 0 ? `${left} of ${total} games still to pick. Due at ${at}.` : `All picked. Lock them in before ${at}.`,
      } });
    }
  }
  if (until <= 45 * 60e3 && until > 0) {
    for (const p of notLocked) out.push({ key: `due45:${week.id}:${p.id}`, players: [p.id], note: {
      title: `Last call: ${label}`, body: `Picks are due at ${at}. You haven't locked yet.`, url: "/", tag: `due-${week.id}`,
    } });
  }
  const claudeLeft = total - pickedCount(week, "claude");
  if (until <= 30 * 60e3 && until > -60 * 60e3 && claudeLeft > 0) {
    out.push({ key: `claude:${week.id}`, players: season.players.filter((p) => p.isAdmin).map((p) => p.id), note: {
      title: `Claude's ${label} picks aren't in`, url: "/",
      body: `${claudeLeft} of ${total} games have no Claude pick, so 2-2 splits have no tie-break. Run the Thursday routine or enter them with Picking as: Claude.`,
    } });
  }
  return out;
}

