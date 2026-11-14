// The weekly recap as a picture for the group chat. `recapCardModel` decides what the card says (pure, tested);
// `drawRecap` paints it on a canvas in the browser and hands back a PNG.
import type { weekRecap } from "./analytics";
import { fmtPct, fmtRec, type Rec } from "./scoring";

type Recap = ReturnType<typeof weekRecap>;
export type Tone = "up" | "down" | "";
const toneOf = (r: Rec): Tone => (r.w > r.l ? "up" : r.l > r.w ? "down" : "");
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export interface RecapCard {
  title: string;
  entry: string;
  tone: Tone;
  sub: string;
  people: { id: string; name: string; rec: string }[];
  stats: { label: string; value: string; note?: string; tone?: Tone }[];
  season: string;
  fileName: string;
}

export function recapCardModel(r: Recap): RecapCard {
  const names = (ps: { name: string }[]) => ps.map((p) => p.name).join(", ");
  const lives = `${r.livesLeft} ${r.livesLeft === 1 ? "life" : "lives"} left`;
  const outcome = r.elim?.outcome === "survived" ? "Survived" : r.elim?.outcome === "died" ? "Life lost" : "Pending";
  return {
    title: `${r.label} recap`,
    entry: fmtRec(r.entry),
    tone: toneOf(r.entry),
    sub: `Entry${r.winnings ? ` · won ${usd(r.winnings)}` : ""}`,
    people: r.people.map((p) => ({ id: p.id, name: p.name, rec: fmtRec(p.rec) })),
    stats: [
      { label: "Best", value: names(r.best), note: fmtRec(r.best[0].rec) },
      { label: "Worst", value: names(r.worst), note: fmtRec(r.worst[0].rec) },
      { label: "All four agreed", value: fmtRec(r.agree), tone: toneOf(r.agree) },
      { label: "3-1 splits", value: fmtRec(r.three), tone: toneOf(r.three) },
      { label: "Claude tie-breaks", value: fmtRec(r.ties), tone: toneOf(r.ties) },
      { label: "Eliminator", value: r.elim?.team ?? "—", note: r.elim?.team ? `${outcome} · ${lives}` : lives },
    ],
    season: `Season entry ${fmtRec(r.season)} (${fmtPct(r.season)})${r.seasonWon ? ` · won ${usd(r.seasonWon)}` : ""}`,
    fileName: `bake-pool-${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`,
  };
}

// The dark "Stadium Night" tokens from globals.css, fixed here so the picture looks the same whatever theme the
// person sharing it uses.
const C = {
  page: "#0a0d12", surface: "#141a22", ring: "rgba(255,255,255,.08)", rule: "#242d39",
  ink: "#f4f6f8", muted: "#a9b3bf", faint: "#8893a1", win: "#2ee68a", loss: "#ff6b6f", blue: "#1560d4",
};
const PLAYER: Record<string, string> = { brad: "#3987e5", andrew: "#eb6834", kevin: "#1baf7a", eric: "#eda100", claude: "#e87ba4" };
const toneColor = (t?: Tone) => (t === "up" ? C.win : t === "down" ? C.loss : C.ink);

export const RECAP_W = 1080, RECAP_H = 1350;

export async function drawRecap(m: RecapCard): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const fam = (v: string) => [css.getPropertyValue(v).trim(), "system-ui", "sans-serif"].filter(Boolean).join(", ");
  const body = fam("--font-plex-sans"), display = fam("--font-plex-cond");
  const font = (weight: number, size: number, family = body) => `${weight} ${size}px ${family}`;
  // Canvas draws with whatever is loaded right now, so wait for the weights used below.
  await Promise.all([font(600, 40), font(700, 40), font(700, 40, display)].map((f) => document.fonts.load(f).catch(() => [])));

  const canvas = document.createElement("canvas");
  canvas.width = RECAP_W; canvas.height = RECAP_H;
  const ctx = canvas.getContext("2d")!;
  const L = 104, R = RECAP_W - 104;

  const text = (s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = "left", maxW?: number) => {
    ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align;
    let out = s;
    if (maxW) while (out.length > 1 && ctx.measureText(out).width > maxW) out = out.slice(0, -2).trimEnd() + "…";
    ctx.fillText(out, x, y);
    return ctx.measureText(out).width;
  };
  const box = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  };
  const rule = (y: number) => { ctx.fillStyle = C.rule; ctx.fillRect(L, y, R - L, 2); };

  ctx.fillStyle = C.page; ctx.fillRect(0, 0, RECAP_W, RECAP_H);
  box(40, 40, RECAP_W - 80, RECAP_H - 80, 44, C.surface);
  ctx.strokeStyle = C.ring; ctx.lineWidth = 2; ctx.stroke();

  // The BAKE mark, as on the app icon: white letters on a blue tile over a green bar.
  box(L, 96, 104, 104, 23, C.blue);
  text("BAKE", L + 52, 158, font(700, 33), "#ffffff", "center");
  box(L + 28, 166, 48, 6, 3, C.win);
  text("BAKE POOL", L + 132, 136, font(700, 28), C.faint);
  text(m.title, L + 132, 192, font(700, 52, display), C.ink, "left", R - L - 132);

  text(m.entry, L - 6, 426, font(700, 210, display), toneColor(m.tone));
  text(m.sub, L, 490, font(600, 38), C.muted);

  let y = 530;
  rule(y);
  for (const p of m.people) {
    ctx.beginPath(); ctx.arc(L + 14, y + 37, 14, 0, Math.PI * 2); ctx.fillStyle = PLAYER[p.id] ?? C.faint; ctx.fill();
    text(p.name, L + 48, y + 51, font(600, 40), C.ink, "left", 560);
    text(p.rec, R, y + 52, font(700, 44, display), C.ink, "right");
    y += 72;
    rule(y);
  }

  // Three rows: best and worst, the three split records, then the eliminator across the full width (its note is long).
  const GAP = 36;
  [m.stats.slice(0, 2), m.stats.slice(2, 5), m.stats.slice(5)].forEach((row, ri) => {
    const colW = (R - L - GAP * (row.length - 1)) / row.length, top = y + 34 + ri * 100;
    row.forEach((s, i) => {
      const x = L + i * (colW + GAP);
      text(s.label.toUpperCase(), x, top + 22, font(600, 23), C.faint, "left", colW);
      ctx.font = font(600, 28);
      const noteW = s.note ? ctx.measureText(s.note).width + 16 : 0;
      const w = text(s.value, x, top + 68, font(700, 38), toneColor(s.tone), "left", Math.max(colW - noteW, colW * 0.55));
      if (s.note) text(s.note, x + w + 16, top + 68, font(600, 28), C.muted, "left", colW - w - 16);
    });
  });

  rule(RECAP_H - 122);
  text(m.season, L, RECAP_H - 70, font(600, 32), C.muted, "left", R - L);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/png"));
}
