// Which Thursday phone reminders are due, worked out from the season (pure, so it can be tested).
import { softDeadline } from "./deadline";
import { isOpen, labelOf, pickedCount, type Season } from "./scoring";

export interface Note { title: string; body: string; url?: string; tag?: string }

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export interface Planned { key: string; players: string[]; note: Note }

/**
 * The Thursday safety-net alert (pure; sent once by key): from 30 minutes before picks are due until an hour after,
 * if Claude doesn't have a pick in every game, Brad gets an alert (the Thursday routine runs on his Mac and may not
 * have run). The "your picks are due" reminder for players is a separate, single notification: see reminderJob.ts.
 */
export function reminderPlan(season: Season, now = Date.now()): Planned[] {
  const week = season.weeks.find((w) => w.deadline && isOpen(w, now) && w.games.length > 0);
  if (!week?.deadline || !week.id) return [];
  const dueIso = softDeadline(week.deadline, season.graceMinutes);
  const until = Date.parse(dueIso) - now;
  const total = week.games.length, label = labelOf(week);
  const out: Planned[] = [];
  const claudeLeft = total - pickedCount(week, "claude");
  if (until <= 30 * 60e3 && until > -60 * 60e3 && claudeLeft > 0) {
    out.push({ key: `claude:${week.id}`, players: season.players.filter((p) => p.isAdmin).map((p) => p.id), note: {
      title: `Claude's ${label} picks aren't in`, url: `/week/${week.week}`,
      body: `${claudeLeft} of ${total} games have no Claude pick, so 2-2 splits have no tie-break. Run the Thursday routine or enter them with Picking as: Claude.`,
    } });
  }
  return out;
}

