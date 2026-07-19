"use client";

// Browser-side AI-generation watermark OCR.
//
// Why browser-side (not server-side): Vercel serverless tesseract.js WASM
// reliably times out / fails to fetch language data, so we run OCR on the
// user's machine instead. It runs in parallel with the Sightengine API call.
//
// Two jobs:
//   1. Enrich the report — when Sightengine returns a verdict we still show the
//      literal watermark text (e.g. "图片由AI生成" / "AI Generated") the user
//      can read and trust.
//   2. Resilience fallback — if the API/Sightengine is unreachable, an explicit
//      AI watermark found here becomes a local likely_ai verdict instead of a
//      hard error.
//
// tesseract.js is loaded via dynamic import so it is code-split out of the
// main bundle and only fetched when a detection actually runs.

import type { Worker } from "tesseract.js";

// AI-generation watermark phrases. English brand/tool stamps + the common
// Chinese "图片由AI生成" style stamps. Matched case-insensitively against OCR
// text with whitespace normalised (OCR inserts spaces between CJK glyphs).
const WATERMARK_PATTERNS: RegExp[] = [
  // Chinese
  /图片由\s*ai\s*生成/i,
  /图片由\s*ai/i,
  /由\s*ai\s*生成/i,
  /ai\s*生成/i,
  /人工智能\s*生成/i,
  /智能\s*生成/i,
  /本图片.*ai/i,
  // English
  /ai\s*generated/i,
  /generated\s*by\s*ai/i,
  /made\s*with\s*ai/i,
  /created\s*by\s*ai/i,
  /this\s*image\s*(is|was)?\s*ai/i,
  /\baigc\b/i,
  // Generators / tools
  /midjourney/i,
  /dall[\s-]?e/i,
  /stable\s*diffusion/i,
  /即梦/i,
  /文心一格/i,
  /文心/i,
  /智谱/i,
  /通义万相/i,
  /秒画/i,
  /豆包/i,
  /civitai/i,
  /leonardo\s*ai/i,
  /adobe\s*firefly/i,
  /bing\s*image\s*creator/i,
];

// jsdelivr-hosted tessdata: flat 4.0.0/<lang>.traineddata.gz, so a single
// base path serves BOTH eng and chi_sim. Core/wasm still come from tesseract.js'
// default CDN (small, fast). If the lang CDN is blocked the call degrades
// gracefully to { found:false } — Sightengine remains the authority.
const LANG_PATH = "https://cdn.jsdelivr.net/gh/naptha/tessdata/4.0.0";
const LANGS = "eng+chi_sim";

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker(LANGS, 1, {
        langPath: LANG_PATH,
        logger: () => {},
      });
    })().catch((err) => {
      workerPromise = null; // allow a later retry
      throw err;
    });
  }
  return workerPromise;
}

export interface OcrWatermarkResult {
  found: boolean;
  /** Matched literal watermark snippet(s), joined by " / ". */
  text: string;
  /** All OCR text (whitespace-normalised) — useful for debugging. */
  raw: string;
}

/**
 * OCR the image and detect an explicit AI-generation watermark.
 * Always resolves (never throws); on any failure returns { found:false }.
 */
export async function detectAiWatermarkOcr(
  image: Blob | string,
  timeoutMs = 15000
): Promise<OcrWatermarkResult> {
  const empty: OcrWatermarkResult = { found: false, text: "", raw: "" };

  let worker: Worker;
  try {
    worker = await Promise.race([
      getWorker(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ocr init timeout")), timeoutMs)
      ),
    ]);
  } catch {
    return empty;
  }

  try {
    const { data } = await worker.recognize(image as never);
    const raw = (data?.text || "").replace(/\s+/g, " ").trim();
    const hits = new Set<string>();
    for (const p of WATERMARK_PATTERNS) {
      const m = raw.match(p);
      if (m) hits.add(m[0].replace(/\s+/g, ""));
    }
    const text = [...hits].join(" / ");
    return { found: text.length > 0, text, raw };
  } catch {
    return empty;
  }
}
