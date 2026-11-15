// The app's drawn icons: 24×24, 1.8 stroke, round caps, coloured by the text around them (see .ux-profile.md).
// Decorative unless given an aria-label: the label next to each carries the meaning.
import type { ReactNode, SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;
const icon = (body: ReactNode) => function Icon(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={p["aria-label"] ? undefined : true} role={p["aria-label"] ? "img" : undefined} {...p}>{body}</svg>
  );
};

// navigation
export const IconWeek = icon(<><rect x="3.5" y="4.5" width="17" height="16" rx="3" /><path d="M3.5 9.5h17M8 3v3M16 3v3M8 14l2.5 2.5L16 12" /></>);
export const IconPool = icon(<path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />);
export const IconElim = icon(<path d="M12 21s-7.5-4.5-7.5-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3.5C19.5 16.5 12 21 12 21z" />);
export const IconLeague = icon(<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />);
export const IconStats = icon(<><path d="M12 3v9l6.4 6.4A9 9 0 1 1 12 3z" /><path d="M15 3.5a9 9 0 0 1 5.5 5.5H15z" /></>);

// marks and controls
export const IconCheck = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconLock = icon(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconChevronLeft = icon(<path d="M14.5 6l-6 6 6 6" />);
export const IconChevronRight = icon(<path d="M9.5 6l6 6-6 6" />);
export const IconChevronDown = icon(<path d="M6 9.5l6 6 6-6" />);
export const IconArrowUp = icon(<path d="M12 19V5M6 11l6-6 6 6" />);
export const IconArrowDown = icon(<path d="M12 5v14M6 13l6 6 6-6" />);
export const IconShare = icon(<path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />);
export const IconMore = icon(<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>);
export const IconClose = icon(<path d="M6 6l12 12M18 6L6 18" />);
