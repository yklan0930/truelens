/**
 * AI Generation Watermark Detector (pure-JS, Vercel-safe).
 *
 * Detects the "图片由AI生成" / "AI Generated" / "Made with AI" watermarks
 * that major AI image generators (Midjourney, DALL·E, 文心一格, 即梦, Vidu,
 * 智谱, 海螺, etc.) automatically stamp on their outputs.
 *
 * The watermark characteristics are pretty consistent across providers:
 *  - Bottom-right corner (or sometimes center-bottom)
 *  - White / light-grey text, ~12-32 px tall on a typical 1024x1024 output
 *  - Either plain text (no logo) or text + tiny icon
 *  - High-contrast against the image background
 *
 * We don't do real OCR (Vercel can't run tesseract.js reliably, and the HF
 * free OCR API doesn't support Chinese). Instead we look for the visual
 * signature: a bottom-region cluster of high-contrast text-like pixels.
 *
 * This is a HEURISTIC. It can:
 *  - Have false positives: a real photo of a person with white t-shirt text
 *    in the bottom-right could match.
 *  - Have false negatives: a heavily-cropped AI image with the watermark cut
 *    off won't match.
 *
 * To compensate, we only treat a positive as a strong hint (~30% probability
 * nudge upward) rather than a hard verdict. It works in conjunction with the
 * vision models.
 */

import Jimp from "jimp";

export interface AIWatermarkResult {
  found: boolean;
  /** "bottom-right" | "bottom-center" | "bottom-left" | "top-right" | "other" */
  position?: string;
  /** 0-100, how strong the watermark signal is. */
  confidence: number;
  /** Pixels that triggered the signal (for debug). */
  details: {
    regionBrightPixelRatio: number; // 0-1, fraction of bright pixels in region
    regionEdgeDensity: number; // 0-1, fraction of high-gradient pixels
    regionTextDensity: number; // 0-1, fraction of pixels that look like text strokes
  };
}

const MIN_DIM = 200;

/**
 * Analyze the image and return the AI watermark signal.
 * Vercel-safe: pure JS + Jimp, no native deps.
 */
export async function detectAIWatermark(
  imageBuffer: Buffer
): Promise<AIWatermarkResult> {
  try {
    const img = await Jimp.read(imageBuffer);
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    if (w < MIN_DIM || h < MIN_DIM) {
      return emptyResult();
    }

    // Examine 6 candidate regions. We pick the one with the strongest
    // text-like signature, then apply a position-aware threshold.
    const regions = [
      { name: "bottom-right", x: Math.floor(w * 0.55), y: Math.floor(h * 0.75), rw: Math.floor(w * 0.4), rh: Math.floor(h * 0.22) },
      { name: "bottom-center", x: Math.floor(w * 0.25), y: Math.floor(h * 0.78), rw: Math.floor(w * 0.5), rh: Math.floor(h * 0.2) },
      { name: "bottom-left", x: Math.floor(w * 0.05), y: Math.floor(h * 0.75), rw: Math.floor(w * 0.4), rh: Math.floor(h * 0.22) },
      { name: "top-right", x: Math.floor(w * 0.55), y: Math.floor(h * 0.03), rw: Math.floor(w * 0.4), rh: Math.floor(h * 0.18) },
      { name: "top-left", x: Math.floor(w * 0.05), y: Math.floor(h * 0.03), rw: Math.floor(w * 0.4), rh: Math.floor(h * 0.18) },
    ];

    let best: { score: number; region: typeof regions[number]; details: { regionBrightPixelRatio: number; regionEdgeDensity: number; regionTextDensity: number } } = {
      score: 0,
      region: regions[0],
      details: { regionBrightPixelRatio: 0, regionEdgeDensity: 0, regionTextDensity: 0 },
    };

    for (const region of regions) {
      const details = analyzeRegion(img, region.x, region.y, region.rw, region.rh);

      // Text-like score: high bright pixel ratio + high edge density + high text density
      // AI watermarks are typically 1-3% bright pixels in the region, with very high edge density.
      // We weight: brightRatio*0.3 + edgeDensity*0.4 + textDensity*0.3
      const score =
        details.regionBrightPixelRatio * 0.3 +
        details.regionEdgeDensity * 0.4 +
        details.regionTextDensity * 0.3;

      if (score > best.score) {
        best = { score, region, details };
      }
    }

    // Threshold: a typical AI watermark scores around 0.15-0.30 on this metric.
    // Real photos without text in the corner score 0.02-0.08. Threshold 0.12.
    const FOUND_THRESHOLD = 0.15;
    const STRONG_THRESHOLD = 0.22;

    // --- Hard gates to suppress false positives ---
    // A genuine AI watermark is SMALL TEXT (e.g. "图片由AI生成"), so it MUST
    // show (a) real edge density (text strokes = many sharp horizontal edges)
    // and (b) genuine text-like runs. Bright blobs (white clothing, sky, a
    // light wall) have near-zero edge density and must NOT count. We also cap
    // the bright-pixel ratio: a watermark covers only a few % of the region,
    // not 30-40% of it.
    const EDGE_GATE = 0.04; // genuine text has many edges; bright blobs ~0
    const TEXT_GATE = 0.2; // genuine text has many character-runs
    const BRIGHT_MIN = 0.01; // watermark is small text, not a dark region
    const BRIGHT_MAX = 0.18; // ...and not a giant bright blob either

    const gatesOk =
      best.details.regionEdgeDensity > EDGE_GATE &&
      best.details.regionTextDensity > TEXT_GATE &&
      best.details.regionBrightPixelRatio >= BRIGHT_MIN &&
      best.details.regionBrightPixelRatio <= BRIGHT_MAX;

    // Position prior: production AI watermarks (Midjourney, DALL·E, 文心一格,
    // 即梦, Vidu, 智谱, 海螺, …) are almost always stamped in a BOTTOM region
    // (bottom-right / bottom-center / bottom-left). A text-like signal in a TOP
    // corner is far more likely real signage / a real photo's text, so we do NOT
    // treat top regions as a watermark. This removes false positives like a real
    // street photo whose top-left white text tripped the heuristic, with zero
    // cost to genuine bottom watermarks. Verified against tests/_wm_report_out.json.
    const isBottomRegion = best.region.name.startsWith("bottom-");

    if (best.score >= FOUND_THRESHOLD && gatesOk && isBottomRegion) {
      return {
        found: true,
        position: best.region.name,
        confidence: best.score >= STRONG_THRESHOLD ? 90 : 65,
        details: best.details,
      };
    }

    return {
      found: false,
      confidence: Math.round(best.score * 100),
      details: best.details,
    };
  } catch (e) {
    console.warn("[TrueLens AI Watermark] detection failed:", e instanceof Error ? e.message : e);
    return emptyResult();
  }
}

function emptyResult(): AIWatermarkResult {
  return {
    found: false,
    confidence: 0,
    details: { regionBrightPixelRatio: 0, regionEdgeDensity: 0, regionTextDensity: 0 },
  };
}

/**
 * Analyze a rectangular region of the image for text-like patterns.
 * Returns three ratios describing the region's visual character.
 */
function analyzeRegion(
  img: Jimp,
  x: number,
  y: number,
  rw: number,
  rh: number
): { regionBrightPixelRatio: number; regionEdgeDensity: number; regionTextDensity: number } {
  // Clamp to image bounds
  x = Math.max(0, Math.min(x, img.bitmap.width - 10));
  y = Math.max(0, Math.min(y, img.bitmap.height - 10));
  rw = Math.min(rw, img.bitmap.width - x);
  rh = Math.min(rh, img.bitmap.height - y);
  if (rw <= 0 || rh <= 0) {
    return { regionBrightPixelRatio: 0, regionEdgeDensity: 0, regionTextDensity: 0 };
  }

  // Downsample the region (we don't need pixel-perfect analysis).
  const downsample = 2;
  const w = Math.floor(rw / downsample);
  const h = Math.floor(rh / downsample);
  const total = w * h;
  if (total < 100) {
    return { regionBrightPixelRatio: 0, regionEdgeDensity: 0, regionTextDensity: 0 };
  }

  // Build a 2D brightness map
  const brightness = new Uint8Array(total);
  let idx = 0;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const px = col * downsample;
      const py = row * downsample;
      const c = Jimp.intToRGBA(img.getPixelColor(x + px, y + py));
      brightness[idx++] = Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
    }
  }

  // 1) Bright pixel ratio (white/light text)
  let bright = 0;
  for (let i = 0; i < total; i++) {
    if (brightness[i] > 200) bright++;
  }
  const regionBrightPixelRatio = bright / total;

  // 2) Edge density: count horizontal gradient spikes (text strokes produce
  //    many short, sharp horizontal transitions)
  let edges = 0;
  for (let row = 0; row < h; row++) {
    for (let col = 1; col < w; col++) {
      const i = row * w + col;
      const d = Math.abs(brightness[i] - brightness[i - 1]);
      if (d > 80) edges++;
    }
  }
  const regionEdgeDensity = edges / total;

  // 3) Text density: count small connected bright runs. Real text has
  //    many small bright clusters (each character is a connected bright
  //    region). We approximate by counting transitions from dark to bright
  //    in each row.
  let textRuns = 0;
  for (let row = 0; row < h; row++) {
    let inRun = false;
    for (let col = 0; col < w; col++) {
      const v = brightness[row * w + col];
      if (v > 180 && !inRun) {
        textRuns++;
        inRun = true;
      } else if (v < 120) {
        inRun = false;
      }
    }
  }
  // Normalize: a typical AI watermark has 8-30 runs per row, no text has ~0
  const regionTextDensity = Math.min(1, textRuns / (h * 4));

  return { regionBrightPixelRatio, regionEdgeDensity, regionTextDensity };
}
