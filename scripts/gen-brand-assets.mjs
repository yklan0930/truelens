// TrueLens 品牌视觉物料生成器 v2.0
// 使用原版 TrueLens logo (盾牌+对勾)，不重新设计
import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "docs/marketing-assets");
fs.mkdirSync(OUT_DIR, { recursive: true });

const LOGO_ICON_PATH = path.resolve(__dirname, "..", "public/logo-icon.png");
const LOGO_FULL_PATH = path.resolve(__dirname, "..", "public/logo.png");

// ─── Resize logo to white background version (for social media) ─
async function prepareLogoForAvatar() {
  // Convert logo-icon.png to a PNG with navy background already composited
  // We'll embed it directly as base64 in the SVG, so just read the file
  const buf = fs.readFileSync(LOGO_ICON_PATH);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ─── 1. Social Media Avatar (1000×1000, circular) ───────────
// 简洁版：原版 TrueLens logo 蓝色镜头铺满整个圆，无白边无黑角
async function genAvatar() {
  const logoBase64 = await prepareLogoForAvatar();
  // 让 logo 的蓝色镜头圆正好 = 头像圆，LOGO_SIZE = 1000/0.86 ≈ 1163
  const LOGO_SIZE = 1163;
  const LOGO_OFFSET = (1000 - LOGO_SIZE) / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs>
    <clipPath id="circle"><circle cx="500" cy="500" r="500"/></clipPath>
  </defs>
  <g clip-path="url(#circle)">
    <image href="${logoBase64}" x="${LOGO_OFFSET}" y="${LOGO_OFFSET}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"/>
  </g>
</svg>`;

  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: 1000 },
    font: { loadSystemFonts: true },
  }).render();
  const pngPath = path.join(OUT_DIR, "avatar.png");
  fs.writeFileSync(pngPath, rendered.asPng());
  console.log(`✅ Avatar: ${pngPath} (${Math.round(rendered.asPng().length / 1024)} KB)`);
}

// ─── 2. Article Cover Template (1200×630) ───────────────────
async function genCoverTemplate() {
  const logoBase64 = await prepareLogoForAvatar();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E2A47"/>
      <stop offset="100%" stop-color="#081B30"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#185FA5"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect x="0" y="0" width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="6" fill="url(#accent)"/>
  <!-- Decorative circles -->
  <circle cx="1100" cy="80" r="200" fill="#185FA5" opacity="0.08"/>
  <circle cx="100" cy="560" r="150" fill="#3B82F6" opacity="0.06"/>

  <!-- Top-left: logo + brand -->
  <image href="${logoBase64}" x="40" y="20" width="80" height="80"/>
  <text x="135" y="58" font-family="Microsoft YaHei" font-size="22" font-weight="bold" fill="#FFFFFF" letter-spacing="3">TrueLens</text>
  <text x="135" y="84" font-family="Microsoft YaHei" font-size="13" font-weight="normal" fill="#9CC3E6">透镜 · AI 内容检测</text>

  <!-- Right side: Big logo as decoration -->
  <image href="${logoBase64}" x="900" y="180" width="280" height="280" opacity="0.12"/>

  <!-- Title area -->
  <text x="80" y="320" font-family="Microsoft YaHei" font-size="42" font-weight="bold" fill="#FFFFFF" letter-spacing="2">[文章标题]</text>
  <text x="80" y="370" font-family="Microsoft YaHei" font-size="24" font-weight="normal" fill="#9CC3E6" letter-spacing="1">[副标题 / 一句话摘要]</text>
  <!-- Decorative line -->
  <line x1="80" y1="420" x2="280" y2="420" stroke="#3B82F6" stroke-width="3"/>

  <!-- Bottom info -->
  <text x="80" y="570" font-family="Microsoft YaHei" font-size="14" font-weight="normal" fill="#94A3B8">www.truelens.top</text>
  <text x="80" y="595" font-family="Microsoft YaHei" font-size="12" font-weight="normal" fill="#94A3B8" opacity="0.6">给每一张图片一个真相</text>

  <rect x="0" y="624" width="1200" height="6" fill="url(#accent)"/>
</svg>`;

  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { loadSystemFonts: true },
  }).render();
  const pngPath = path.join(OUT_DIR, "cover-template.png");
  fs.writeFileSync(pngPath, rendered.asPng());
  console.log(`✅ Cover Template: ${pngPath} (${Math.round(rendered.asPng().length / 1024)} KB)`);
}

// ─── 3. Xiaohongshu Note Template (1080×1440) ──────────────
async function genXiaohongshuTemplate() {
  const logoBase64 = await prepareLogoForAvatar();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E2A47"/>
      <stop offset="100%" stop-color="#081B30"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#185FA5"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1080" height="1440" fill="url(#bg)"/>
  <rect x="0" y="0" width="1080" height="8" fill="url(#accent)"/>

  <!-- Top brand bar -->
  <image href="${logoBase64}" x="40" y="30" width="70" height="70"/>
  <text x="125" y="68" font-family="Microsoft YaHei" font-size="20" font-weight="bold" fill="#FFFFFF" letter-spacing="2">TrueLens 透镜</text>
  <text x="125" y="92" font-family="Microsoft YaHei" font-size="13" font-weight="normal" fill="#9CC3E6">AI 内容检测专家</text>

  <!-- Title area -->
  <text x="60" y="380" font-family="Microsoft YaHei" font-size="56" font-weight="bold" fill="#FFFFFF" letter-spacing="2">[标题]</text>

  <!-- Image placeholder area -->
  <rect x="60" y="450" width="960" height="540" rx="16" fill="#0F2D4A" stroke="#1E4D7B" stroke-width="2"/>
  <text x="540" y="710" font-family="Microsoft YaHei" font-size="22" font-weight="normal" fill="#4A7A9C" text-anchor="middle">[ 配图区域 ]</text>

  <!-- Description area -->
  <text x="60" y="1070" font-family="Microsoft YaHei" font-size="24" font-weight="normal" fill="#9CC3E6">[正文内容行一]</text>
  <text x="60" y="1110" font-family="Microsoft YaHei" font-size="24" font-weight="normal" fill="#9CC3E6">[正文内容行二]</text>
  <text x="60" y="1150" font-family="Microsoft YaHei" font-size="24" font-weight="normal" fill="#9CC3E6">[正文内容行三]</text>

  <!-- Decorative -->
  <line x1="60" y1="1210" x2="240" y2="1210" stroke="#3B82F6" stroke-width="3"/>

  <!-- Bottom branding -->
  <rect x="0" y="1370" width="1080" height="70" fill="#0A1E33"/>
  <image href="${logoBase64}" x="40" y="1380" width="50" height="50"/>
  <text x="100" y="1402" font-family="Microsoft YaHei" font-size="16" font-weight="bold" fill="#FFFFFF">TrueLens 透镜</text>
  <text x="100" y="1424" font-family="Microsoft YaHei" font-size="12" font-weight="normal" fill="#9CC3E6">www.truelens.top</text>
</svg>`;

  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: 540 },
    font: { loadSystemFonts: true },
  }).render();
  const pngPath = path.join(OUT_DIR, "xhs-cover-template.png");
  fs.writeFileSync(pngPath, rendered.asPng());
  console.log(`✅ XHS Cover: ${pngPath} (${Math.round(rendered.asPng().length / 1024)} KB)`);
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  await genAvatar();
  await genCoverTemplate();
  await genXiaohongshuTemplate();
  console.log("\n✅ All brand assets regenerated with original TrueLens logo");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
