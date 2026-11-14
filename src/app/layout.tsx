import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";
import "./stadium.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans" });
// Condensed cut of the same family for scores, records and screen titles.
const plexCond = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-plex-cond" });

const PAGE_DARK = "#0a0d12";
const SPLASH = [[430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 2], [375, 667, 2]] as const;

export const metadata: Metadata = {
  title: "BAKE Pool",
  description: "Weekly picks, standings and eliminator for the BAKE pool.",
  appleWebApp: {
    capable: true, title: "BAKE Pool", statusBarStyle: "black-translucent",
    // What an iPhone shows while the app opens from the Home Screen (made by scripts/make-icons.mjs).
    startupImage: SPLASH.map(([w, h, d]) => ({
      url: `/splash-${w}x${h}@${d}x.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)`,
    })),
  },
  icons: { icon: [{ url: "/favicon.png", sizes: "48x48", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-icon.png" },
};

// The header band is the same near-black in both themes, so the phone's status bar always matches it.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: PAGE_DARK };

/** Runs before first paint: applies the saved theme (dark unless the person chose light, or "system" and the phone is light). */
const themeScript = `try{var t=localStorage.getItem("bake-theme")||"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexCond.variable}`} data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
