import colors from "./teamColors.json";

const C = colors as Record<string, { b: string; t: string }>;

/** Team brand colours as CSS custom properties, with a neutral fallback. */
export function teamVars(team: string | null | undefined): React.CSSProperties {
  const c = team ? C[team] : undefined;
  return (c ? { "--team": `#${c.b}`, "--tb": `#${c.b}`, "--tt": `#${c.t}` } : {}) as React.CSSProperties;
}

/** "+3.5" for the underdog, "-3.5" for the favourite. */
export const spreadFor = (team: string, fav: string, spread: number) =>
  spread === 0 ? "PK" : `${team === fav ? "-" : "+"}${spread}`;
