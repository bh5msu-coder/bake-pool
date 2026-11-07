// Pure pool math: majority, group entry, grading, records, money, eliminator.
// Everything here is UI- and database-agnostic so it can be unit tested.

export type PlayerId = string;
export type Grade = "W" | "L" | "P";
export type Rec = { w: number; l: number; p: number };

export interface Player {
  id: PlayerId;
  name: string;
  initial: string;
  kind: "human" | "bot";
  isAdmin: boolean;
}

export interface Game {
  id?: number;
  num: number;
  league: "NFL" | "NCAA";
  away: string;
  home: string;
  fav: string;
  spread: number;
  line: string;
  result: string | null; // team that covered, or "PUSH"
  /** A human's call on the submitted pick (beats the majority and Claude). */
  entryOverride?: string | null;
  /** Who made the call. */
  entryOverrideBy?: PlayerId | null;
  /** When the call was last set or cleared (null = never touched in the app). */
  entryOverrideAt?: string | null;
  picks: Record<PlayerId, string>;
}

export interface ElimWeek {
  picks: Record<PlayerId, string>;
  override?: string | null;
  outcome?: "survived" | "died" | null;
  /** Who has voted, while the votes themselves are hidden (before the reveal). */
  voters?: PlayerId[];
}

export interface Week {
  id?: number;
  week: number; // running order through the season
  label?: string | null; // "Week 7", "Bowl", "CFP"…
  deadline: string | null; // ISO
  entryFee: number;
  winnings: number;
  games: Game[];
  elim: ElimWeek;
  /** Players who have locked their picks for this week. */
  locks?: string[];
  /** Picks per player while the week's picks are hidden (others' teams aren't loaded, only how many). */
  counts?: Record<PlayerId, number>;
}

export interface LedgerEntry { label: string; amount: number } // negative = paid out

export interface Season {
  season: number;
  players: Player[];
  weeks: Week[];
  /** Weeks on the schedule whose lines aren't posted yet (no games). `deadline` is an estimate, or null when unknown. */
  upcoming?: { id?: number; week: number; label: string; deadline: string | null }[];
  /** Eliminator lives bought back after the first one; each costs `elimBuybackCost`. */
  elimBuybacks: number;
  elimBuybackCost: number;
  /** Paid up front for the whole season (the sheet's Summary total). */
  seasonFee: number;
  /** Grace period in minutes between when picks are due and the hard lock (the week's deadline). */
  graceMinutes: number;
  /** Pick reminder emails go out this many minutes before picks are due. */
  reminderLeadMinutes: number;
  ledger: LedgerEntry[];
}

export const labelOf = (w: Week) => w.label || `Week ${w.week}`;
/** Short form for tight spots: "W7", "Bowl". */
export const shortLabel = (w: Week) => (/^Week (\d+)$/.exec(labelOf(w)) ? `W${w.week}` : labelOf(w));

/** One life to start, plus each paid buy-back. */
export const elimLives = (s: Season) => 1 + s.elimBuybacks;

/** Virtual pickers computed from the real ones. */
export const MAJORITY = "majority";
export const ENTRY = "entry";
export const BOT = "claude";

export const humans = (players: Player[]) => players.filter((p) => p.kind === "human");

function tally(teams: string[]) {
  const counts = new Map<string, number>();
  for (const t of teams) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Team picked by more than half of all human players, else null (e.g. a 2-2 tie). */
export function majority(game: Game, humanIds: PlayerId[]): string | null {
  const teams = humanIds.map((id) => game.picks[id]).filter(Boolean);
  const [top] = tally(teams);
  return top && top[1] > humanIds.length / 2 ? top[0] : null;
}

/** "4-0", "3-1" or "2-2" once every human has picked; null before that. */
export function split(game: Game, humanIds: PlayerId[]): string | null {
  const teams = humanIds.map((id) => game.picks[id]);
  if (teams.some((t) => !t)) return null;
  const a = teams.filter((t) => t === game.away).length;
  return `${Math.max(a, teams.length - a)}-${Math.min(a, teams.length - a)}`;
}

/** The pick that goes on the submitted entry: a human's call if one is set, else the Humans majority (3 of 4),
 *  else Claude, who is only the tiebreaker. */
export function entryPick(game: Game, humanIds: PlayerId[]): string | null {
  return game.entryOverride || majority(game, humanIds) || game.picks[BOT] || null;
}

export type EntryHow = "human" | "majority" | "claude";
/** How the submitted pick was decided, or null when there's no pick yet. */
export function entryHow(game: Game, humanIds: PlayerId[]): EntryHow | null {
  if (game.entryOverride) return "human";
  if (majority(game, humanIds)) return "majority";
  return game.picks[BOT] ? "claude" : null;
}

/** Display names for the virtual pickers. */
export const HUMANS_LABEL = "Humans";
export const SUBMITTED_LABEL = "Submitted";

/** Players who were alone on their side in a 3-1 split. */
export function soloPicker(game: Game, humanIds: PlayerId[]): PlayerId | null {
  if (split(game, humanIds) !== "3-1") return null;
  const maj = majority(game, humanIds);
  return humanIds.find((id) => game.picks[id] !== maj) ?? null;
}

export function grade(pick: string | null | undefined, result: string | null): Grade | null {
  if (!pick || !result) return null;
  if (result === "PUSH") return "P";
  return pick === result ? "W" : "L";
}

/** Pick for a real player or a virtual picker (majority / entry). */
export function pickOf(game: Game, who: PlayerId, humanIds: PlayerId[]): string | null {
  if (who === MAJORITY) return majority(game, humanIds);
  if (who === ENTRY) return entryPick(game, humanIds);
  return game.picks[who] ?? null;
}

export const emptyRec = (): Rec => ({ w: 0, l: 0, p: 0 });

export function record(games: Game[], who: PlayerId, humanIds: PlayerId[]): Rec {
  const r = emptyRec();
  for (const g of games) {
    const v = grade(pickOf(g, who, humanIds), g.result);
    if (v === "W") r.w++;
    else if (v === "L") r.l++;
    else if (v === "P") r.p++;
  }
  return r;
}

export const pct = (r: Rec) => (r.w + r.l ? r.w / (r.w + r.l) : null);
export const fmtPct = (r: Rec) => {
  const v = pct(r);
  return v === null ? "—" : v === 1 ? "1.000" : "." + String(Math.round(v * 1000)).padStart(3, "0");
};
export const fmtRec = (r: Rec) => `${r.w}-${r.l}${r.p ? `-${r.p}` : ""}`;

export function band(spread: number): string {
  if (spread <= 3) return "0-3";
  if (spread <= 7) return "3.5-7";
  if (spread <= 10) return "7.5-10";
  if (spread <= 14) return "10.5-14";
  return ">14";
}
export const BANDS = ["0-3", "3.5-7", "7.5-10", "10.5-14", ">14"];

export const side = (g: Game, team: string | null) => (!team ? null : team === g.fav ? "Fav" : "Dog");

export const isGraded = (w: Week) => w.games.some((g) => g.result);
export const isFinal = (w: Week) => w.games.length > 0 && w.games.every((g) => g.result);
export const isOpen = (w: Week, now = Date.now()) => !w.deadline || now < Date.parse(w.deadline);

/** How many games a player has picked this week, even when their teams are hidden. */
export const pickedCount = (w: Week, id: PlayerId) =>
  Math.max(w.counts?.[id] ?? 0, w.games.filter((g) => g.picks[id]).length);

/** Every human has locked and Claude has a pick in every game: the group entry is final. */
export const groupLocked = (w: Week, players: Player[]) =>
  w.games.length > 0 && humans(players).every((p) => w.locks?.includes(p.id))
  && pickedCount(w, "claude") >= w.games.length;

/** Everyone's picks are visible once the week locks, or earlier when the whole group has locked. */
export const revealed = (w: Week, players: Player[], now = Date.now()) => !isOpen(w, now) || groupLocked(w, players);

/** Head to head between two pickers, counting only games where they disagreed. */
export function headToHead(games: Game[], a: PlayerId, b: PlayerId, humanIds: PlayerId[]) {
  let aw = 0, bw = 0, n = 0;
  for (const g of games) {
    const pa = pickOf(g, a, humanIds), pb = pickOf(g, b, humanIds);
    if (!pa || !pb || pa === pb || !g.result) continue;
    n++;
    if (grade(pa, g.result) === "W") aw++;
    if (grade(pb, g.result) === "W") bw++;
  }
  return { a: aw, b: bw, games: n };
}

// ---------- money ----------
export function money(s: Season) {
  const weekly = s.seasonFee + s.weeks.reduce((t, w) => t + w.entryFee, 0);
  const buybacks = s.elimBuybacks * s.elimBuybackCost;
  const other = s.ledger.reduce((t, e) => t + e.amount, 0);
  const fees = weekly + buybacks;
  const won = s.weeks.reduce((t, w) => t + w.winnings, 0);
  const net = won - fees + other;
  const n = humans(s.players).length || 1;
  return { weekly, buybacks, other, fees, won, net, each: net / n };
}

// ---------- eliminator (pick a team to LOSE outright; if it wins, a life is gone) ----------
export function elimTeam(e: ElimWeek, humanIds: PlayerId[]): string | null {
  if (e.override) return e.override;
  const [top, second] = tally(humanIds.map((id) => e.picks[id]).filter(Boolean));
  if (!top) return null;
  return second && second[1] === top[1] ? null : top[0];
}

export function elimSummary(s: Season, now = Date.now()) {
  const ids = humans(s.players).map((p) => p.id);
  const rows = s.weeks.map((w) => ({
    week: w.week, short: shortLabel(w), team: elimTeam(w.elim, ids), outcome: w.elim.outcome ?? null, closed: !isOpen(w, now),
  }));
  // A team is used up once its week locks, whether or not the result is in yet.
  const burned = rows.filter((r) => r.team && (r.outcome || r.closed)).map((r) => ({ team: r.team!, week: r.week, short: r.short }));
  const deaths = rows.filter((r) => r.outcome === "died").length;
  const lives = elimLives(s);
  return { rows, burned, lives, livesLeft: Math.max(0, lives - deaths), alive: deaths < lives };
}

/** Teams already used in the eliminator, excluding the given week. */
export function usedElimTeams(s: Season, exceptWeek: number) {
  const ids = humans(s.players).map((p) => p.id);
  return new Set(
    s.weeks.filter((w) => w.week !== exceptWeek).map((w) => elimTeam(w.elim, ids)).filter(Boolean) as string[],
  );
}

// ---------- entry payload ----------
export function entryLines(w: Week, humanIds: PlayerId[]) {
  const lines = w.games.map((g) => entryPick(g, humanIds) ?? "");
  const blanks = lines.filter((l) => !l).length;
  return { lines, blanks, text: lines.join("\n") };
}
