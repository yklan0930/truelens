// Process the new TrueLens logo into all required sizes
// Run with: node scripts/process-logo.mjs
import jimpPkg from "jimp";
import { resolve } from "node:path";

const Jimp = jimpPkg.default || jimpPkg;

const SRC = resolve(
  "C:/Users/Michael/WorkBuddy/2026-07-16-10-54-35/generated-images/Professional_logo_design_for___2026-07-19T02-40-07.png"
);
const OUT_DIR = resolve("./public");

const SIZES = [
  { name: "favicon-32.png", w: 32, h: 32, crop: true },
  { name: "favicon-16.png", w: 16, h: 16, crop: true },
  { name: "apple-touch-icon.png", w: 180, h: 180, crop: true },
  { name: "icon-192.png", w: 192, h: 192, crop: true },
  { name: "icon-512.png", w: 512, h: 512, crop: true },
  { name: "logo.png", w: 1024, h: 1024, crop: false }, // full with text
  { name: "logo-icon.png", w: 1024, h: 1024, crop: true }, // icon only large
];

async function main() {
  const src = await Jimp.read(SRC);
  const w = src.bitmap.width;
  const h = src.bitmap.height;

  // By inspection, the icon (lens + shield) takes roughly the top 60% of the
  // image, horizontally centered. Crop a square from the top containing the icon.
  const iconSize = Math.round(Math.min(w, h) * 0.58);
  const iconX = Math.round((w - iconSize) / 2);
  const iconY = Math.round(h * 0.05); // small top padding

  console.log(`Source: ${w}x${h}, cropping icon: ${iconSize}x${iconSize} at (${iconX},${iconY})`);

  for (const { name, w: tw, h: th, crop } of SIZES) {
    let img;
    if (crop) {
      img = src.clone().crop(iconX, iconY, iconSize, iconSize);
    } else {
      img = src.clone();
    }
    img = img.resize(tw, th);
    const out = `${OUT_DIR}/${name}`;
    await img.write(out);
    console.log(`Wrote ${out} (${tw}x${th})`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
