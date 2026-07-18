/**
 * Face / Skin analysis detector (pure-JS, no external model, Vercel-safe).
 *
 * Why this approach (vs an ML face detector):
 *   - A real ML face detector (picojs / YuNet / MediaPipe) needs a model weight
 *     file fetched at runtime or bundled. On Vercel Serverless the WASM/native
 *     runtimes have proven unreliable for us (tesseract.js OCR failed there).
 *   - This detector uses only `jimp` (pure-JS decode) + pixel maths, so it is
 *     100% free, has zero native/WASM deps, and always runs.
 *
 * What it does (the "face detection + skin smoothing" the product needs):
 *   1. Decode + downscale the image.
 *   2. Build a YCbCr + RGB skin mask, then localize the face region as the
 *      bounding box of the densest central skin cluster (a portrait localizer).
 *   3. Within that region, measure skin "smoothness" via Laplacian
 *      high-frequency energy: beauty filters / heavy retouching erase the fine
 *      pores & texture, driving this number down.
 *   4. Emit a REAL (portrait present) or REAL_RETOUCHED (smoothed skin) signal
 *      that the analyzer uses to moderate the ViT AI score.
 *
 * Everything is best-effort: any failure returns null and the main pipeline is
 * untouched.
 */

import Jimp from "jimp";

export interface FaceSkinResult {
  faceFound: boolean;
  /** Heuristic confidence 0-1 that a real human face is present. */
  faceConfidence: number;
  /** Fraction of the face region that is skin (0-1). */
  skinCoverage: number;
  /** Mean Laplacian magnitude over skin pixels (lower = smoother). */
  meanLaplacian: number;
  /** 0-1, higher = smoother skin (1 = perfectly smooth). */
  smoothness: number;
  /** Smoothed skin inside a portrait → beauty filter / retouching. */
  beautified: boolean;
  signal: "real" | "real_retouched" | null;
  /** AI-lean score 0-100 for the signals panel (lower = more likely real). */
  score: number;
}

const MAX_DIM = 320;
const MAXLAP = 35; // reference scale for smoothness normalisation
const SKIN_MEANLAP_SMOOTH = 22; // below this → skin is smoothed (beauty filter)
const COVERAGE_GATE = 0.25; // face region must be mostly skin to count as portrait
const CENTRAL_SKIN_GATE = 0.04; // central crop must contain some skin to localize

function isSkin(r: number, g: number, b: number): boolean {
  // Combined RGB (Phung/Kovac-style) + YCbCr rule — permissive across skin tones.
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const rgbOk =
    r > 60 && g > 40 && b > 20 && r >= g && r >= b && r - g > 10 && r - b > 15;
  const yccOk = cb >= 75 && cb <= 130 && cr >= 130 && cr <= 178;
  return rgbOk && yccOk;
}

export async function analyzeFaceSkin(
  imageBuffer: Buffer
): Promise<FaceSkinResult | null> {
  try {
    const img = await Jimp.read(imageBuffer);
    let W = img.bitmap.width;
    let H = img.bitmap.height;
    if (!W || !H) return null;

    const scale = Math.min(1, MAX_DIM / Math.max(W, H));
    const nW = Math.max(16, Math.round(W * scale));
    const nH = Math.max(16, Math.round(H * scale));
    img.resize(nW, nH);
    W = nW;
    H = nH;

    const data = img.bitmap.data;
    const N = W * H;
    const gray = new Float32Array(N);
    const skin = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      skin[i] = isSkin(r, g, b) ? 1 : 0;
    }

    // --- Face region localisation: densest central skin cluster ---
    const x0 = Math.floor(0.1 * W);
    const x1 = Math.floor(0.9 * W);
    const y0 = Math.floor(0.08 * H);
    const y1 = Math.floor(0.92 * H);
    let minX = W;
    let minY = H;
    let maxX = 0;
    let maxY = 0;
    let cropSkin = 0;
    let cropArea = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        cropArea++;
        if (skin[y * W + x]) {
          cropSkin++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    const cropRatio = cropArea ? cropSkin / cropArea : 0;
    if (cropRatio < CENTRAL_SKIN_GATE || cropSkin < 20) {
      return {
        faceFound: false,
        faceConfidence: 0,
        skinCoverage: 0,
        meanLaplacian: 0,
        smoothness: 0,
        beautified: false,
        signal: null,
        score: 50,
      };
    }

    // Expand the bounding box ~12% to include hairline / jaw edges.
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const bx0 = Math.max(0, Math.floor(minX - bw * 0.12));
    const by0 = Math.max(0, Math.floor(minY - bh * 0.12));
    const bx1 = Math.min(W - 1, Math.ceil(maxX + bw * 0.12));
    const by1 = Math.min(H - 1, Math.ceil(maxY + bh * 0.12));

    let lapSum = 0;
    let skinInBox = 0;
    let boxArea = 0;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        boxArea++;
        const idx = y * W + x;
        if (!skin[idx]) continue;
        skinInBox++;
        const g = gray[idx];
        const xl = x > 0 ? gray[idx - 1] : g;
        const xr = x < W - 1 ? gray[idx + 1] : g;
        const yu = y > 0 ? gray[idx - W] : g;
        const yd = y < H - 1 ? gray[idx + W] : g;
        lapSum += Math.abs(2 * g - xl - xr) + Math.abs(2 * g - yu - yd);
      }
    }

    const coverage = boxArea ? skinInBox / boxArea : 0;
    const meanLap = skinInBox ? lapSum / skinInBox : 0;
    const smoothness = 1 - Math.min(1, meanLap / MAXLAP);
    const faceConf = Math.min(1, cropRatio * 2 + coverage);

    let beautified = false;
    let signal: FaceSkinResult["signal"] = null;
    let score = 50;
    if (coverage > COVERAGE_GATE) {
      // A clear portrait → strong evidence of a real photograph.
      signal = "real";
      score = 30;
      if (meanLap < SKIN_MEANLAP_SMOOTH) {
        // Smoothed skin inside a portrait → beauty filter / retouching pipeline.
        beautified = true;
        signal = "real_retouched";
        score = 22;
      }
    }

    return {
      faceFound: true,
      faceConfidence: faceConf,
      skinCoverage: coverage,
      meanLaplacian: meanLap,
      smoothness,
      beautified,
      signal,
      score,
    };
  } catch {
    // Decoding / analysis failure — never block the main detection.
    return null;
  }
}
