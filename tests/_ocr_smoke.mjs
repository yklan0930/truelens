// Smoke test: confirm the OCR + watermark-pattern logic actually fires on the
// known Chinese-watermark image (ai-food.jpg) using local tesseract + langdata.
import { createWorker } from "tesseract.js";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANG_PATH = path.join(__dirname, "tessdata"); // local eng+chi_sim

const PATTERNS = [
  /图片由\s*ai\s*生成/i, /图片由\s*ai/i, /由\s*ai\s*生成/i, /ai\s*生成/i, /人工智能\s*生成/i,
  /智能\s*生成/i, /本图片.*ai/i, /ai\s*generated/i, /generated\s*by\s*ai/i,
  /made\s*with\s*ai/i, /created\s*by\s*ai/i, /this\s*image\s*(is|was)?\s*ai/i,
  /\baigc\b/i, /midjourney/i, /dall[\s-]?e/i, /stable\s*diffusion/i,
  /即梦/i, /文心一格/i, /文心/i, /智谱/i, /通义万相/i, /秒画/i, /豆包/i,
  /civitai/i, /leonardo\s*ai/i, /adobe\s*firefly/i, /bing\s*image\s*creator/i,
];

const worker = await createWorker("eng+chi_sim", 1, { langPath: LANG_PATH, logger: () => {} });

for (const f of ["ai-food.jpg", "beach.png", "real-beach.jpg", "real-street.jpg"]) {
  const img = path.join(__dirname, "images", f);
  const { data } = await worker.recognize(img);
  const raw = (data.text || "").replace(/\s+/g, " ").trim();
  const norm = raw.replace(/\s+/g, "");
  const hits = [...new Set(PATTERNS.map((p) => norm.match(p)?.[0]?.replace(/\s+/g, "")).filter(Boolean))];
  console.log(`\n### ${f}`);
  console.log(`  raw: ${raw.slice(0, 120)}`);
  console.log(`  WATERMARK ${hits.length ? "FOUND ✅" : "not found"}  -> ${hits.join(" | ") || "-"}`);
}
await worker.terminate();
