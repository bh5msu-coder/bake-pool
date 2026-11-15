import colors from "./teamColors.json";

const C = colors as Record<string, { b: string; t: string }>;

/** Team brand colours as CSS custom properties, with a neutral fallback. */
export function teamVars(team: string | null | undefined): React.CSSProperties {
  const c = team ? C[team] : undefined;
  return (c ? { "--team": `#${c.b}`, "--tb": `#${c.b}`, "--tt": `#${c.t}` } : {}) as React.CSSProperties;
}

/** "+3.5" for the underdog, "−3.5" (true minus sign) for the favourite. Display only. */
export const spreadFor = (team: string, fav: string, spread: number) =>
  spread === 0 ? "PK" : `${team === fav ? "−" : "+"}${spread}`;

/** Shorter spellings for the longest team names, for phone-width rows. Anything not listed keeps its full name. */
const SHORT: Record<string, string> = {
  Indianapolis: "Indy", Jacksonville: "Jax", Philadelphia: "Philly", "San Francisco": "San Fran", "Kansas City": "KC", "LA Chargers": "Chargers",
  "Mississippi State": "Miss St", "Oklahoma State": "Okla St", "South Carolina": "S Carolina", "Boston College": "BC", "West Virginia": "W Virginia",
  "Virginia Tech": "Va Tech", "South Florida": "USF", "Florida State": "Florida St", "East Carolina": "ECU", "Arizona State": "Arizona St",
  "Oregon State": "Oregon St", Northwestern: "N'western", "Kansas State": "K-State", "Georgia Tech": "Ga Tech", "Wake Forest": "Wake",
};

/** A team's short name: from the list above, else "State" becomes "St" on long names, else the name as it is. */
export const shortName = (team: string) =>
  SHORT[team] ?? (team.length > 12 && team.endsWith(" State") ? `${team.slice(0, -6)} St` : team);
