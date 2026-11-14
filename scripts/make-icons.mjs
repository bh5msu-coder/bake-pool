// Draws the app icons and iPhone splash screens from one SVG mark. Run: node scripts/make-icons.mjs
// (sharp is already a dev dependency). Output goes to public/.
import sharp from "sharp";

const PAGE = "#0a0d12", BLUE = "#1560d4", GREEN = "#2ee68a";

/**
 * The same mark the app has always had (the word BAKE over a bar), in the Stadium Night colours:
 * bright blue tile, white letters, green bar. `pad` is the empty margin around the tile, 0-0.5;
 * `bg` fills that margin (leave it null for a full-bleed tile).
 */
const mark = (size, pad, bg) => {
  const m = size * pad, s = size - 2 * m;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bg ?? BLUE}"/>
    ${bg ? `<rect x="${m}" y="${m}" width="${s}" height="${s}" rx="${s * 0.22}" fill="${BLUE}"/>` : ""}
    <text x="${size / 2}" y="${m + s * 0.585}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="${s * 0.33}" fill="#ffffff">BAKE</text>
    <rect x="${m + s * 0.27}" y="${m + s * 0.66}" width="${s * 0.46}" height="${s * 0.05}" rx="${s * 0.025}" fill="${GREEN}"/>
  </svg>`);
};

const png = (svg, file) => sharp(svg).png().toFile(`public/${file}`);

await png(mark(192, 0, null), "icon-192.png");
await png(mark(512, 0, null), "icon-512.png");
// Maskable: Android crops to a circle or squircle, so the mark sits inside the middle 60% on a full-bleed background.
await png(mark(512, 0.14, BLUE), "icon-maskable-512.png");
// iPhone home screen: no transparency, iOS rounds the corners itself.
await png(mark(180, 0, null), "apple-icon.png");
await png(mark(48, 0, null), "favicon.png");

// iPhone splash screens (portrait): the mark centred on the page colour. [css width, css height, pixel ratio]
const PHONES = [[430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 2], [375, 667, 2]];
for (const [w, h, d] of PHONES) {
  const W = w * d, H = h * d, tile = Math.round(W * 0.28);
  const logo = await sharp(mark(tile, 0.001, PAGE)).png().toBuffer();
  await sharp({ create: { width: W, height: H, channels: 4, background: PAGE } })
    .composite([{ input: logo, left: Math.round((W - tile) / 2), top: Math.round((H - tile) / 2) }])
    .png({ compressionLevel: 9 }).toFile(`public/splash-${w}x${h}@${d}x.png`);
}
console.log("icons and splash screens written to public/");
