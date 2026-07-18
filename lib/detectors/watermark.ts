/**
 * Watermark OCR Detector
 *
 * Many REAL photos that get falsely flagged as "AI" are actually retouched /
 * beautified real photos exported by apps like 轻颜, 美图秀秀, B612, Faceu, etc.
 * These apps embed a small brand watermark (usually bottom-left / bottom-center)
 * into the exported image. Detecting such a watermark is strong evidence that
 * the image is a REAL photo that was edited — NOT AI-generated.
 *
 * We use tesseract.js (pure WASM, runs in the Node runtime) to OCR the image
 * and match against a curated list of beauty / photo-editing app brands.
 *
 * This detector is BEST-EFFORT:
 *   - It is wrapped in a hard timeout so it can never block the main analysis.
 *   - Any failure (missing traineddata, CDN blocked, worker error) returns null
 *     and the analyzer simply ignores it — the rest of the pipeline is unaffected.
 *   - If a local `tessdata/` directory exists next to the project root, it is
 *     used as the language-data source (self-contained deployment, e.g. Vercel);
 *     otherwise tesseract.js falls back to downloading from its CDN.
 */

import fs from "fs";
import path from "path";
import Tesseract from "tesseract.js";
import { type ServerLocale } from "@/lib/i18n/server";

export interface WatermarkResult {
  found: boolean;
  /** Display label of the matched brand, e.g. "轻颜". */
  app?: string;
  /** Normalized key of the matched brand. */
  appKey?: string;
  /** OCR confidence (0-100) of the matched word. */
  confidence: number;
  /** Approximate vertical position of the watermark. */
  position?: "bottom" | "top" | "other";
  /** Full OCR text (debug / transparency). */
  ocrText?: string;
}

/**
 * Curated list of beauty / camera / photo-editing app brand names that embed
 * a watermark. Kept specific on purpose — social platforms (微信/抖音/小红书)
 * are intentionally excluded because they rarely watermark exported *photos*
 * and are already handled by filename heuristics.
 */
const WATERMARK_BRANDS = [
  // Chinese beauty / camera / editing apps
  "轻颜相机",
  "美图秀秀",
  "美颜相机",
  "美妆相机",
  "无他相机",
  "一甜相机",
  "轻颜",
  "美图",
  "美颜",
  "无他",
  "醒图",
  "可颂",
  "一甜",
  "甜盐",
  "甜颜",
  "天天p图",
  "玩图",
  "元气",
  "清颜",
  "潮自拍",
  "黄油相机",
  "foodie",
  "insta360",
  "激萌",
  // English / latin brands
  "b612",
  "b612咔叽",
  "faceu",
  "camera360",
  "相机360",
  "ulike",
  "wuta",
  "snow",
  "facetune",
  "picsart",
  "snapseed",
  "vsco",
  "lightroom",
  "photoshop",
];

const normalize = (s: string): string => s.replace(/\s+/g, "").toLowerCase();

/**
 * Match OCR text against the known watermark brand list.
 * Returns the longest matching brand (specific brands win over generic ones).
 */
export function matchBrand(text: string): { app: string; key: string } | null {
  const norm = normalize(text);
  if (!norm) return null;
  const sorted = [...WATERMARK_BRANDS].sort((a, b) => b.length - a.length);
  for (const brand of sorted) {
    const b = normalize(brand);
    if (b && norm.includes(b)) return { app: brand, key: b };
  }
  return null;
}

/** Use a bundled tessdata/ directory only if the required language files are
 *  actually present (self-contained deployment). Otherwise return undefined so
 *  tesseract.js falls back to its default CDN (jsDelivr) at runtime.
 */
function resolveLangPath(): string | undefined {
  try {
    const p = path.join(process.cwd(), "tessdata");
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const hasEng = fs.existsSync(path.join(p, "eng.traineddata"));
      const hasChi = fs.existsSync(path.join(p, "chi_sim.traineddata"));
      if (hasEng && hasChi) return p;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

type BBox = { x0: number; y0: number; x1: number; y1: number } | undefined;

function inferPosition(bbox: BBox, maxY: number): "bottom" | "top" | "other" {
  if (!bbox || !maxY) return "other";
  const y = bbox.y1;
  if (y > maxY * 0.6) return "bottom";
  if (y < maxY * 0.3) return "top";
  return "other";
}

export async function detectWatermark(
  imageBuffer: Buffer,
  _locale: ServerLocale = "zh",
  timeoutMs = 8000
): Promise<WatermarkResult | null> {
  const langPath = resolveLangPath();
  const options: Record<string, unknown> = { logger: () => {} };
  if (langPath) options.langPath = langPath;

  const ocrTask = Tesseract.recognize(imageBuffer, "chi_sim+eng", options)
    .then(({ data }) => data)
    .catch(() => null);

  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeoutMs)
  );

  const data = await Promise.race([ocrTask, timeout]);
  if (!data) return null;

  const words = (data.words || []) as Array<{
    text: string;
    confidence: number;
    bbox?: BBox;
  }>;

  const maxY = words.reduce((m, w) => Math.max(m, w.bbox?.y1 ?? 0), 0);

  // Word-level match (preferred): keeps confidence + position.
  let best: {
    app: string;
    key: string;
    confidence: number;
    position: "bottom" | "top" | "other";
  } | null = null;

  for (const w of words) {
    if ((w.confidence ?? 0) < 50) continue;
    const m = matchBrand(w.text);
    if (!m) continue;
    const position = inferPosition(w.bbox, maxY);
    const cand = { app: m.app, key: m.key, confidence: w.confidence ?? 0, position };
    if (!best || cand.confidence > best.confidence) best = cand;
  }

  if (best) {
    return {
      found: true,
      app: best.app,
      appKey: best.key,
      confidence: Math.round(best.confidence),
      position: best.position,
      ocrText: data.text,
    };
  }

  // Fallback: match across the concatenation of all words (catches tokens that
  // the OCR engine split across multiple "words", e.g. "轻 颜").
  const combined = normalize(words.map((w) => w.text).join(""));
  const combinedMatch = matchBrand(combined);
  if (combinedMatch) {
    return {
      found: true,
      app: combinedMatch.app,
      appKey: combinedMatch.key,
      confidence: 60,
      ocrText: data.text,
    };
  }

  return { found: false, confidence: 0, ocrText: data.text };
}
