// How a pick stands against the spread while a game is being played.
import type { Game } from "./scoring";

/** Points `team` is ahead of (+) or behind (−) the spread at these scores. 0 is a push. */
export function coverMargin(g: Pick<Game, "away" | "home" | "fav" | "spread">, team: string, awayScore: number, homeScore: number): number {
  const favMargin = g.fav === g.home ? homeScore - awayScore : awayScore - homeScore;
  return team === g.fav ? favMargin - g.spread : g.spread - favMargin;
}

/** "Covering by 2.5", "Behind by 3", or "On the number" for a push. */
export const coverText = (m: number) => (m === 0 ? "On the number" : `${m > 0 ? "Covering" : "Behind"} by ${Math.abs(m)}`);
