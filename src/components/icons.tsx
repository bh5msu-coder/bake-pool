// Small stroke icons for navigation. Decorative: the label next to each carries the meaning.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconWeek = () => (
  <svg viewBox="0 0 24 24" aria-hidden {...P}><rect x="3.5" y="4.5" width="17" height="16" rx="3" /><path d="M3.5 9.5h17M8 3v3M16 3v3M8 14l2.5 2.5L16 12" /></svg>
);
export const IconPool = () => (
  <svg viewBox="0 0 24 24" aria-hidden {...P}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></svg>
);
export const IconElim = () => (
  <svg viewBox="0 0 24 24" aria-hidden {...P}><path d="M12 21s-7.5-4.5-7.5-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3.5C19.5 16.5 12 21 12 21z" /></svg>
);
export const IconExplore = () => (
  <svg viewBox="0 0 24 24" aria-hidden {...P}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
);
