/**
 * Screen re-photography detector (pure-JS, Vercel-safe).
 *
 * A phone photo OF a screen (a screenshot, slide, or webpage re-photographed)
 * is a genuine capture but carries fingerprints that the vision model keeps
 * mis-reading as AI-generated:
 *   1. Moiré + sub-pixel grid — two regular lattices (phone CMOS vs screen
 *      RGB sub-pixels) interfere into a fine periodic high-frequency pattern.
 *   2. Scanline / pixel-grid periodicity — screen pixels are a perfectly
 *      regular 1-D lattice, visible in row/column intensity projections.
 *   3. Colour banding — 8-bit display gradients quantise into visible steps.
 *
 * IMPORTANT SAFETY PROPERTY: this detector NEVER softens the AI probability.
 * Lowering a 99% AI score for "looks like a screen" would let real AI images
 * slip through. Instead we ANNOTATE the result as "likely unreliable" and
 * reduce confidence, so the user judges with context.
 *
 * KEY DISCRIMINATOR: we only look for FINE periodicity (lag 2-12 px). Real
 * world regular textures (brick walls, blinds) have LARGE periods (lag >> 12)
 * and therefore do NOT trigger the primary gate.
 *
 * Best-effort: any failure returns null, pipeline untouched.
 */

import Jimp from "jimp";

export interface ScreenResult {
  /** Whether screen analysis produced a usable signal. */
  analyzed: boolean;
  /** 0-1 likelihood this is a screen re-photograph (higher = more likely). */
  screenScore: number;
  /** 0-1, periodic row/column projection self-correlation (primary gate). */
  periodScore: number;
  /** 0-1, directional high-frequency imbalance (sub-pixel stripes). */
  directionScore: number;
  /** 0-1, colour-banding / quantisation steps in smooth regions. */
  bandingScore: number;
  /** True when fingerprints strongly suggest a screen re-photograph. */
  isScreenCapture: boolean;
}

const MAX_DIM = 200; // downscale for projection / gradient analysis
const MIN_LAG = 2;
const MAX_LAG = 12; // FINE periods only (screen sub-pixel / moiré), not brick/blinds
const PERIOD_GATE = 0.55; // primary gate — strong fine periodicity required
const SCREEN_GATE = 0.4; // combined-score gate

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Separable box blur (radius r) on a Float32 grayscale buffer. */
function boxBlur(
  src: Float32Array,
  w: number,
  h: number,
  r: number
): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        s += src[y * w + xx];
        c++;
      }
      tmp[y * w + x] = s / c;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        s += tmp[yy * w + x];
        c++;
      }
      out[y * w + x] = s / c;
    }
  }
  return out;
}

/**
 * Normalised peak autocorrelation over lags [minLag, maxLag].
 * Returns 0 for noise / flat, up to 1 for a perfect periodic signal.
 */
function periodPeak(proj: Float32Array, minLag: number, maxLag: number): number {
  const n = proj.length;
  if (n < minLag + 2) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += proj[i];
  mean /= n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = proj[i] - mean;
    varSum += d * d;
  }
  const variance = varSum / n;
  if (variance < 1e-6) return 0; // flat (solid colour / no structure)
  let best = 0;
  const hi = Math.min(maxLag, n - 2);
  for (let lag = minLag; lag <= hi; lag++) {
    // Skip JPEG 8x8 block periodicity — it is universal in compressed photos
    // and would otherwise masquerade as a screen grid. Real moiré / sub-pixel
    // periods are finer (2-5px) and survive this exclusion.
    if (lag % 8 === 0) continue;
    let s = 0;
    for (let i = 0; i < n - lag; i++) {
      s += (proj[i] - mean) * (proj[i + lag] - mean);
    }
    const ac = s / ((n - lag) * variance);
    if (ac > best) best = ac;
  }
  return clamp01(best);
}

export async function analyzeScreen(
  imageBuffer: Buffer
): Promise<ScreenResult | null> {
  try {
    const img = await Jimp.read(imageBuffer);
    const W = img.bitmap.width;
    const H = img.bitmap.height;
    if (!W || !H) return null;
    const scale = Math.min(1, MAX_DIM / Math.max(W, H));
    const nW = Math.max(32, Math.round(W * scale));
    const nH = Math.max(32, Math.round(H * scale));
    const small = img.clone().resize(nW, nH);
    const sdata = small.bitmap.data;
    const N = nW * nH;
    const gray = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      gray[i] = 0.299 * sdata[p] + 0.587 * sdata[p + 1] + 0.114 * sdata[p + 2];
    }

    // --- Row & column projection periodicity (PRIMARY GATE) ---
    // Project the HIGH-PASS residual (gray - blurred), NOT raw gray. Raw gray
    // carries slow low-frequency trends (sky gradients, large flat regions)
    // whose autocorrelation is ~1 over short lags and would masquerade as a
    // period. The residual isolates fine, repeating structure: moiré / sub-pixel
    // grids (screen) and JPEG 8x8 blocks (all JPEGs). We exclude lag 8 to drop
    // the latter.
    const blur = boxBlur(gray, nW, nH, 2);
    const res = new Float32Array(N);
    for (let i = 0; i < N; i++) res[i] = gray[i] - blur[i];

    const rowProj = new Float32Array(nH);
    const colProj = new Float32Array(nW);
    for (let y = 0; y < nH; y++) {
      let s = 0;
      for (let x = 0; x < nW; x++) s += res[y * nW + x];
      rowProj[y] = s / nW;
    }
    for (let x = 0; x < nW; x++) {
      let s = 0;
      for (let y = 0; y < nH; y++) s += res[y * nW + x];
      colProj[x] = s / nH;
    }
    const rowAC = periodPeak(rowProj, MIN_LAG, Math.min(MAX_LAG, nH - 1));
    const colAC = periodPeak(colProj, MIN_LAG, Math.min(MAX_LAG, nW - 1));
    const periodScore = clamp01(Math.max(rowAC, colAC));

    // --- Directional high-frequency imbalance (sub-pixel stripes) ---
    // Sobel Gx / Gy on grayscale; compare mean |Gx| vs mean |Gy|. A screen's
    // sub-pixel lattice often boosts one orientation's gradient energy.
    let magX = 0;
    let magY = 0;
    for (let y = 1; y < nH - 1; y++) {
      for (let x = 1; x < nW - 1; x++) {
        const i = y * nW + x;
        const tl = gray[i - nW - 1],
          tc = gray[i - nW],
          tr = gray[i - nW + 1];
        const ml = gray[i - 1],
          mr = gray[i + 1];
        const bl = gray[i + nW - 1],
          bc = gray[i + nW],
          br = gray[i + nW + 1];
        const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
        const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
        magX += Math.abs(gx);
        magY += Math.abs(gy);
      }
    }
    const denom = magX + magY + 1e-6;
    const directionScore = clamp01(Math.abs(magX - magY) / denom);

    // --- Colour banding in smooth regions (quantisation steps) ---
    // In low-gradient areas, adjacent-pixel differences of a smooth 8-bit
    // gradient cluster at small discrete steps. Measure concentration of the
    // dominant small-step difference.
    const smooth = new Uint8Array(N);
    let smoothCount = 0;
    for (let i = 0; i < N; i++) {
      const xl = i > 0 ? gray[i - 1] : gray[i];
      const xr = i < N - 1 ? gray[i + 1] : gray[i];
      const yu = i >= nW ? gray[i - nW] : gray[i];
      const yd = i < N - nW ? gray[i + nW] : gray[i];
      const g = Math.abs(xr - xl) + Math.abs(yd - yu);
      if (g < 4) {
        smooth[i] = 1;
        smoothCount++;
      }
    }
    let bandingScore = 0;
    if (smoothCount > N * 0.1) {
      const HIST = 32;
      const hist = new Float64Array(HIST);
      let cnt = 0;
      for (let y = 0; y < nH; y++) {
        for (let x = 1; x < nW; x++) {
          const i = y * nW + x;
          if (!smooth[i]) continue;
          let d = Math.round(gray[i] - gray[i - 1]);
          if (d < -15) d = -15;
          if (d > 15) d = 15;
          hist[d + 15] += 1;
          cnt++;
        }
      }
      if (cnt > 0) {
        let maxBin = 0;
        for (let b = 0; b < HIST; b++) if (hist[b] > maxBin) maxBin = hist[b];
        bandingScore = clamp01(maxBin / cnt);
      }
    }

    const screenScore = clamp01(
      0.6 * periodScore + 0.25 * directionScore + 0.15 * bandingScore
    );
    const isScreenCapture = periodScore > PERIOD_GATE && screenScore > SCREEN_GATE;

    return {
      analyzed: true,
      screenScore,
      periodScore,
      directionScore,
      bandingScore,
      isScreenCapture,
    };
  } catch {
    return null;
  }
}
