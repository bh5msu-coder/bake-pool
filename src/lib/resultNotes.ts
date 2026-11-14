// Which "something happened" phone notifications are due, worked out from the season (pure, so it can be tested).
// Each has a key so it goes out once, and a kind so a person can switch that kind off on their phone.
import { ENTRY, fmtRec, groupLocked, humans, isOpen, labelOf, record, elimTeam, type Season, type Week } from "./scoring";
import type { Note } from "./reminders";

/** Kinds a person can turn on or off. `final` (every game you picked) is off unless they ask for it. */
export type NoteKind = "recap" | "elim" | "reveal" | "final";
export const NOTE_KINDS: { kind: NoteKind; label: string; hint: string; byDefault: boolean }[] = [
  { kind: "reveal", label: "Picks revealed", hint: "When everyone has locked and the group's picks are showing", byDefault: true },
  { kind: "recap", label: "Week results", hint: "The entry's record and yours when the last game ends", byDefault: true },
  { kind: "elim", label: "Eliminator result", hint: "Whether the group survived the week", byDefault: true },
  { kind: "final", label: "Every final score", hint: "One per game as it ends (up to 30 a week)", byDefault: false },
];
export const wants = (prefs: Record<string, unknown> | null | undefined, kind: NoteKind) => {
  const v = prefs?.[kind];
  return typeof v === "boolean" ? v : NOTE_KINDS.find((k) => k.kind === kind)!.byDefault;
};

export interface PlannedNote { key: string; kind: NoteKind; players: string[]; note: Note }

/** Results are only news for a few days: nothing is sent for a week that locked more than this long ago. */
const FRESH_MS = 6 * 864e5;
const fresh = (w: Week, now: number) => !!w.deadline && now - Date.parse(w.deadline) <= FRESH_MS;

export function resultNotes(season: Season, now = Date.now()): PlannedNote[] {
  const people = humans(season.players), ids = people.map((p) => p.id);
  const out: PlannedNote[] = [];
  for (const w of season.weeks) {
    if (!w.id || !w.games.length) continue;
    const label = labelOf(w);

    // Everyone locked early: the picks are showing before the deadline.
    if (isOpen(w, now) && groupLocked(w, season.players)) {
      out.push({ key: `reveal:${w.id}`, kind: "reveal", players: ids, note: {
        title: `${label}: everyone's locked`, body: "The group's picks are showing now. Take a look at the entry.", url: `/week/${w.week}`, tag: `reveal-${w.id}`,
      } });
    }
    if (isOpen(w, now) || !fresh(w, now)) continue;

    // The last game is graded: the week's record for the entry and for each person.
    if (w.games.every((g) => g.result)) {
      const entry = fmtRec(record(w.games, ENTRY, ids));
      for (const p of people) {
        out.push({ key: `recap:${w.id}:${p.id}`, kind: "recap", players: [p.id], note: {
          title: `${label} final: entry ${entry}`, url: `/week/${w.week}`, tag: `recap-${w.id}`,
          body: `You went ${fmtRec(record(w.games, p.id, ids))}.${w.winnings > 0 ? ` The entry won $${w.winnings}.` : ""}`,
        } });
      }
    }

    // The eliminator team has played.
    const team = elimTeam(w.elim, ids);
    if (w.elim.outcome && team) {
      const lived = w.elim.outcome === "survived";
      out.push({ key: `elim:${w.id}`, kind: "elim", players: ids, note: {
        title: lived ? `Eliminator: survived ${label}` : `Eliminator: a life is gone`, url: `/elim/${w.week}`, tag: `elim-${w.id}`,
        body: lived ? `${team} lost, so the group lives on.` : `${team} won, so the group lost a life in ${label}.`,
      } });
    }
  }
  return out;
}

export interface FinalGame { week: number; label: string; away: string; home: string; awayScore: number; homeScore: number; covering: string; picks: Record<string, string> }

/** One note per person per game that just went final, saying whether their pick covered. */
export function finalNotes(g: FinalGame, humanIds: string[]): PlannedNote[] {
  const score = `${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}`;
  return humanIds.filter((id) => g.picks[id]).map((id) => {
    const push = g.covering === "PUSH", won = g.picks[id] === g.covering;
    return { key: `final:${g.label}:${g.away}:${id}`, kind: "final" as const, players: [id], note: {
      title: `${push ? "Push" : won ? "Covered" : "Missed"}: ${g.picks[id]}`, url: `/week/${g.week}`,
      body: `Final: ${score}. ${push ? "Landed on the number." : `${g.covering} covered.`}`,
    } };
  });
}
