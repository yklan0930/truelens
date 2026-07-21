import { Resvg } from "@resvg/resvg-js";
import fs from "fs";

const DIR = "C:/Users/Michael/WorkBuddy/2026-07-16-10-54-35/TrueLens/docs/war-room/assets";

// ── 1. Content background: subtle gradient + faint geometry ──
const contentBg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FBFCFE"/>
      <stop offset="55%" stop-color="#F4F8FC"/>
      <stop offset="100%" stop-color="#E9F0F8"/>
    </linearGradient>
    <radialGradient id="glowTR" cx="100%" cy="0%" r="60%">
      <stop offset="0%" stop-color="#185FA5" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#185FA5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowBL" cx="0%" cy="100%" r="55%">
      <stop offset="0%" stop-color="#0E2A47" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#0E2A47" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="2.2" fill="#0E2A47" opacity="0.045"/>
    </pattern>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#dots)"/>
  <rect width="1600" height="900" fill="url(#glowTR)"/>
  <rect width="1600" height="900" fill="url(#glowBL)"/>
  <circle cx="1480" cy="120" r="220" fill="#185FA5" opacity="0.05"/>
  <circle cx="120" cy="820" r="180" fill="#0E2A47" opacity="0.04"/>
</svg>`;

// ── 2. Cover overlay: dark gradient left→transparent (text legibility) ──
const coverOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="cov" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0A1F38" stop-opacity="0.92"/>
      <stop offset="38%" stop-color="#0E2A47" stop-opacity="0.78"/>
      <stop offset="68%" stop-color="#0E2A47" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#0E2A47" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#cov)"/>
</svg>`;

// ── 3. Lens mark (TrueLens logo): concentric lens + cyan ring ──
const lensMark = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#185FA5"/>
    </linearGradient>
  </defs>
  <circle cx="120" cy="120" r="104" fill="none" stroke="url(#ring)" stroke-width="10"/>
  <circle cx="120" cy="120" r="78" fill="none" stroke="#0E2A47" stroke-width="6" opacity="0.55"/>
  <circle cx="120" cy="120" r="40" fill="#185FA5"/>
  <circle cx="104" cy="104" r="12" fill="#FFFFFF" opacity="0.85"/>
  <path d="M196 196 L236 236" stroke="url(#ring)" stroke-width="14" stroke-linecap="round"/>
</svg>`;

// ── 4. Thin accent bar (gradient) for section headers ──
const accentBar = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="8" viewBox="0 0 320 8">
  <defs>
    <linearGradient id="bar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#185FA5"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>
  <rect width="320" height="8" rx="4" fill="url(#bar)"/>
</svg>`;

const jobs = [
  ["content-bg.png", contentBg],
  ["cover-overlay.png", coverOverlay],
  ["lens-mark.png", lensMark],
  ["accent-bar.png", accentBar],
];

for (const [name, svg] of jobs) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: 1600 } });
  const png = r.render().asPng();
  fs.writeFileSync(`${DIR}/${name}`, png);
  console.log("✅", name, `${png.length} bytes`);
}
