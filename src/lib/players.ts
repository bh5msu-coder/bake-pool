// Fixed colour per picker (validated categorical palette, see globals.css).
// Colour follows the person, never their rank, so it stays put across filters and sorts.
import type { CSSProperties } from "react";
import { ENTRY, MAJORITY } from "./scoring";

const KNOWN = new Set(["brad", "andrew", "kevin", "eric", "claude", ENTRY, MAJORITY, "leader", "cutoff"]);
/** Light fills need dark initials on chips. */
const LIGHT_FILL = new Set(["kevin", "eric", "claude"]);

export const colorOf = (id: string) => (KNOWN.has(id) ? `var(--p-${id})` : "var(--faint)");
export const cvar = (id: string) => ({ "--c": colorOf(id) }) as CSSProperties;
export const chipClass = (id: string) => (LIGHT_FILL.has(id) ? " light" : "");
