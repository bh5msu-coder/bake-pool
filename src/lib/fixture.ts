// Season data captured from the shared sheet (weeks 1-6). Used by tests and the
// local demo mode; the live app reads from Supabase instead.
import raw from "@/fixtures/season2026.json";
import { nextDeadline } from "./deadline";
import type { Game, Player, Season } from "./scoring";

export const DEFAULT_PLAYERS: Player[] = [
  { id: "brad", name: "Brad", initial: "B", kind: "human", isAdmin: true },
  { id: "andrew", name: "Andrew", initial: "A", kind: "human", isAdmin: false },
  { id: "kevin", name: "Kevin", initial: "K", kind: "human", isAdmin: false },
  { id: "eric", name: "Eric", initial: "E", kind: "human", isAdmin: false },
  { id: "claude", name: "Claude", initial: "C", kind: "bot", isAdmin: false },
];

type RawGame = Omit<Game, "league"> & { league: string; expect: { majority: string | null; entry: string | null; split: string | null } };
type Raw = { weeks: { week: number; games: RawGame[] }[]; elimPicks: Record<string, Record<string, string>>; winnings: Record<string, number> };

export const fixtureRaw = raw as unknown as Raw;

export function fixtureSeason(): Season {
  const r = fixtureRaw;
  const outcomes: Record<number, "survived" | "died"> = { 1: "survived", 2: "survived", 3: "survived", 4: "survived", 5: "died" };
  return {
    season: 2026,
    players: DEFAULT_PLAYERS,
    elimBuybacks: 1,
    elimBuybackCost: 100,
    seasonFee: 1250,
    graceMinutes: 150,
    reminderLeadMinutes: 60,
    ledger: [],
    weeks: r.weeks.map((w) => ({
      week: w.week,
      deadline: nextDeadline(new Date(Date.parse("2026-09-09T17:00:00Z") + (w.week - 1) * 7 * 864e5), 4, 12, 0).toISOString(),
      entryFee: 0,
      winnings: r.winnings[w.week] ?? 0,
      games: w.games.map(({ expect: _e, ...g }) => ({ ...g, league: g.league as Game["league"], entryOverride: null })),
      // Week 3 was a 2-2 eliminator vote; the sheet settled it on Arizona.
      elim: { picks: r.elimPicks[w.week] ?? {}, override: w.week === 3 ? "Arizona" : null, outcome: outcomes[w.week] ?? null },
    })),
  };
}
