/**
 * Watermark Detector (v2 — HF API + tesseract.js fallback)
 *
 * Many REAL photos falsely flagged as "AI" are retouched / beautified real photos
 * from apps like 轻颜, 美图秀秀, B612, Faceu, etc.  These apps embed a brand
 * watermark (usually bottom-left) into the exported image.
 *
 * v2 architecture (fixes Vercel Serverless compatibility):
 *   Strategy 1 — HuggingFace Inference API (TrOCR / OCR model):
 *     Uses the same HF token & proxy infrastructure as our ViT detector.
 *     Fast (~2-5s), reliable on Vercel, no WASM/CDN dependency.
 *
 *   Strategy 2 — tesseract.js (local WASM, best-effort fallback):
 *     Only runs when HF found nothing.  Needs local tessdata/ or CDN download.
 *     Can time out or fail on Vercel — gracefully returns null.
 *
 * Both strategies feed into matchBrand() which checks against a curated list
 * of beauty / photo-editing app brands.  Any match is strong evidence of an
 * EDITED REAL photo, not AI-generated.
 */

import fs from "fs";
import path from "path";
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
  /** Which strategy produced the result. */
  source?: "hf" | "tesseract";
}

// ── Brand list ──────────────────────────────────────────────────────

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
 * Returns the longest matching brand (specific wins over generic).
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

// ── Proxy helper (same pattern as huggingface.ts) ───────────────────

let proxyConfigured = false;
function ensureProxy() {
  if (proxyConfigured) return;
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  if (proxyUrl) {
    try {
      const { ProxyAgent, setGlobalDispatcher } = require("undici");
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
    } catch {
      // silent fail — production Vercel doesn't need proxy
    }
  }
  proxyConfigured = true;
}

// ── Strategy 1: HuggingFace Inference API ───────────────────────────

/** Known-working HF models for image-to-text (OCR). Tried in order. */
const HF_OCR_MODELS = [
  "microsoft/trocr-base-printed",        // Latin printed text (B612, Faceu, Foodie…)
  "microsoft/trocr-base-handwritten",    // Handwritten style watermarks
];

/**
 * Call HF Inference API with an OCR model to extract text from the image.
 * Returns raw OCR text or null on failure.
 */
async function ocrWithHF(
  imageBuffer: Buffer,
  token: string,
  timeoutMs = 6000
): Promise<string | null> {
  ensureProxy();

  for (const model of HF_OCR_MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const url = `https://router.huggingface.co/hf-inference/models/${model}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
        },
        body: new Uint8Array(imageBuffer),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        // Model not supported / loading → skip to next model
        console.warn(`[Watermark/HF] ${model} → ${res.status}`);
        continue;
      }

      const data = await res.json();
      // TrOCR returns: [{ generated_text: "…" }] or { generated_text: "…" }
      const text =
        Array.isArray(data)
          ? data.map((d: Record<string, unknown>) => String(d.generated_text ?? "")).join(" ")
          : String(data.generated_text ?? data.text ?? "");

      if (text.trim()) return text.trim();
    } catch (err) {
      console.warn(`[Watermark/HF] ${model} error:`, err instanceof Error ? err.message : err);
      // Continue to next model
    }
  }

  return null;
}

// ── Strategy 2: tesseract.js fallback ──────────────────────────────

async function ocrWithTesseract(
  imageBuffer: Buffer,
  _locale: ServerLocale,
  timeoutMs = 8000
): Promise<string | null> {
  try {
    const Tesseract = (await import("tesseract.js")).default;

    const langPath = resolveLangPath();
    const options: Record<string, unknown> = { logger: () => {} };
    if (langPath) options.langPath = langPath;

    const ocrTask = Tesseract.recognize(imageBuffer, "chi_sim+eng", options)
      .then(({ data }) => data.text || "")
      .catch(() => null);

    const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
    const text = await Promise.race([ocrTask, timeout]);

    return text?.trim() && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function resolveLangPath(): string | undefined {
  try {
    const p = path.join(process.cwd(), "tessdata");
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const hasEng = fs.existsSync(path.join(p, "eng.traineddata"));
      const hasChi = fs.existsSync(path.join(p, "chi_sim.traineddata"));
      if (hasEng && hasChi) return p;
    }
  } catch { /* ignore */ }
  return undefined;
}

// ── Public API ──────────────────────────────────────────────────────

export async function detectWatermark(
  imageBuffer: Buffer,
  hfToken: string,
  locale: ServerLocale = "zh",
  timeoutMs = 12000
): Promise<WatermarkResult | null> {
  const start = Date.now();

  // --- Strategy 1: HF OCR (fast, reliable on Vercel) ---
  let hfText: string | null = null;
  try {
    hfText = await ocrWithHF(imageBuffer, hfToken, Math.min(6000, timeoutMs));
  } catch { /* ignore */ }

  if (hfText) {
    console.log(`[Watermark] HF OCR text (${Date.now() - start}ms):`, hfText.slice(0, 200));
    const m = matchBrand(hfText);
    if (m) {
      return {
        found: true,
        app: m.app,
        appKey: m.key,
        confidence: 80, // HF OCR is generally reliable
        ocrText: hfText,
        source: "hf",
      };
    }
  }

  // --- Strategy 2: tesseract.js (fallback, especially for Chinese) ---
  // Only proceed if we have time budget left
  const elapsed = Date.now() - start;
  const remaining = Math.max(3000, timeoutMs - elapsed);

  let tessText: string | null = null;
  try {
    tessText = await ocrWithTesseract(imageBuffer, locale, remaining);
  } catch { /* ignore */ }

  if (tessText) {
    console.log(`[Watermark] Tesseract text (${Date.now() - start}ms):`, tessText.slice(0, 200));
    const m = matchBrand(tessText);
    if (m) {
      return {
        found: true,
        app: m.app,
        appKey: m.key,
        confidence: 65, // Tesseract confidence varies more
        ocrText: tessText,
        source: "tesseract",
      };
    }
  }

  // No brand matched — return negative result for debugging
  if (hfText || tessText) {
    return {
      found: false,
      confidence: 0,
      ocrText: hfText || tessText || undefined,
    };
  }

  // Both strategies failed silently
  return null;
}
