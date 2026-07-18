/**
 * Natural-photo texture / noise fingerprint detector (pure-JS, Vercel-safe).
 *
 * Why this detector exists:
 *   The face/skin detector (skin.ts) only covers PORTRAITS. There is a second
 *   class of real photos that the vision model (ViT) still over-flags as AI:
 *   non-portrait images that have been retouched, colour-graded, or shot in
 *   HDR — landscapes, products, food, screenshots-of-art, etc. They look
 *   "too perfect" but are genuine camera/phone captures.
 *
 * What separates a real camera photo from a diffusion-AI image at the pixel
 * level (the features we measure):
 *   1. Sensor-noise heteroscedasticity — real sensor noise variance grows with
 *      signal intensity (photon shot noise + read noise). Diffusion noise is
 *      roughly uniform Gaussian. This is the STRONGEST discriminator, so it is
 *      the primary gate.
 *   2. JPEG 8x8 block artifacts — real camera/phone exports are JPEG-compressed
 *      and show characteristic block-boundary discontinuities. (Used only as a
 *      corroborating booster, never alone, because AI images re-saved as JPEG
 *      also show blocking.)
 *   3. Micro-texture richness — real photos keep natural, non-uniform
 *      micro-detail; heavily smoothed/AI regions are flatter.
 *
 * Safety: this detector only EVER nudges a borderline ViT score toward
 * "uncertain". It never flips a confident AI verdict, and it requires genuine
 * sensor-noise heteroscedasticity before claiming "natural photo", so it will
 * not let a re-compressed AI image through.
 *
 * Everything is best-effort: any failure returns null and the main pipeline is
 * untouched.
 */

import Jimp from "jimp";

export interface TextureResult {
  /** Whether texture analysis produced a usable signal. */
  analyzed: boolean;
  /** 0-1 likelihood this is a natural camera/phone photo (higher = more real). */
  naturalScore: number;
  /** Std of high-pass residual over flat regions (sensor-noise level). */
  noiseLevel: number;
  /** 0-1, signal-dependence of noise. Higher = more sensor-like. Primary gate. */
  heteroscedasticity: number;
  /** 0-1, JPEG 8x8 blocking strength. */
  jpegBlocking: number;
  /** 0-1, local-contrast richness (micro-texture). */
  microTexture: number;
  /** Real photo fingerprint detected → moderate REAL-leaning signal. */
  signal: "real" | null;
  /** AI-lean score 0-100 for the signals panel (lower = more likely real). */
  score: number;
}

const SMALL = 256; // downscale for noise / heteroscedasticity / micro-texture
const BLOCK = 8; // JPEG block size in original pixels
const FLAT_THRESHOLD = 10; // gradient below this = "flat" region (noise only)
const HETERO_GATE = 0.4; // minimum sensor-noise heteroscedasticity to claim real

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

export async function analyzeTexture(
  imageBuffer: Buffer
): Promise<TextureResult | null> {
  try {
    const img = await Jimp.read(imageBuffer);
    const W = img.bitmap.width;
    const H = img.bitmap.height;
    if (!W || !H) return null;
    const data = img.bitmap.data;

    // --- Downscaled grayscale for noise / heteroscedasticity / micro-texture ---
    const scale = Math.min(1, SMALL / Math.max(W, H));
    const nW = Math.max(16, Math.round(W * scale));
    const nH = Math.max(16, Math.round(H * scale));
    const small = img.clone().resize(nW, nH);
    const sdata = small.bitmap.data;
    const N = nW * nH;
    const gray = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      gray[i] = 0.299 * sdata[p] + 0.587 * sdata[p + 1] + 0.114 * sdata[p + 2];
    }

    // --- Noise residual (high-pass): gray - blurred ---
    const blur = boxBlur(gray, nW, nH, 1);
    const res = new Float32Array(N);
    for (let i = 0; i < N; i++) res[i] = gray[i] - blur[i];

    // --- Local gradient magnitude (to isolate flat regions) ---
    const grad = new Float32Array(N);
    for (let y = 0; y < nH; y++) {
      for (let x = 0; x < nW; x++) {
        const i = y * nW + x;
        const xl = x > 0 ? gray[i - 1] : gray[i];
        const xr = x < nW - 1 ? gray[i + 1] : gray[i];
        const yu = y > 0 ? gray[i - nW] : gray[i];
        const yd = y < nH - 1 ? gray[i + nW] : gray[i];
        grad[i] = Math.abs(xr - xl) + Math.abs(yd - yu);
      }
    }

    // --- Noise level + heteroscedasticity over FLAT regions only ---
    let rs = 0;
    let rs2 = 0;
    let rn = 0;
    const BINS = 16;
    const binMag = new Float64Array(BINS);
    const binInt = new Float64Array(BINS);
    const binCnt = new Int32Array(BINS);
    for (let i = 0; i < N; i++) {
      if (grad[i] >= FLAT_THRESHOLD) continue; // skip edges → keep noise only
      const v = res[i];
      rs += v;
      rs2 += v * v;
      rn++;
      const b = Math.min(BINS - 1, Math.floor((gray[i] / 256) * BINS));
      binMag[b] += Math.abs(v);
      binInt[b] += gray[i];
      binCnt[b]++;
    }
    const noiseLevel = rn
      ? Math.sqrt(Math.max(0, rs2 / rn - (rs / rn) * (rs / rn)))
      : 0;

    // Pearson correlation between mean intensity and mean |residual| per bin.
    let heteroscedasticity = 0;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let b = 0; b < BINS; b++) {
      if (binCnt[b] < 5) continue;
      xs.push(binInt[b] / binCnt[b]);
      ys.push(binMag[b] / binCnt[b]);
    }
    if (xs.length >= 3) {
      const nn = xs.length;
      let mx = 0;
      let my = 0;
      for (let i = 0; i < nn; i++) {
        mx += xs[i];
        my += ys[i];
      }
      mx /= nn;
      my /= nn;
      let cov = 0;
      let vx = 0;
      let vy = 0;
      for (let i = 0; i < nn; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        cov += dx * dy;
        vx += dx * dx;
        vy += dy * dy;
      }
      const denom = Math.sqrt(vx * vy);
      heteroscedasticity = denom > 1e-6 ? Math.max(0, Math.min(1, cov / denom)) : 0;
    }

    // --- Micro-texture: mean local std (3x3) over whole image ---
    let ltSum = 0;
    let ltN = 0;
    for (let y = 1; y < nH - 1; y++) {
      for (let x = 1; x < nW - 1; x++) {
        let s = 0;
        let s2 = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const v = gray[(y + ky) * nW + (x + kx)];
            s += v;
            s2 += v * v;
          }
        }
        const m = s / 9;
        ltSum += Math.sqrt(Math.max(0, s2 / 9 - m * m));
        ltN++;
      }
    }
    const microTextureRaw = ltN ? ltSum / ltN : 0; // ~0-40 on 0-255 scale
    const microTexture = Math.min(1, microTextureRaw / 22);

    // --- JPEG 8x8 blocking (full-res, subsampled) ---
    // Read grayscale on the fly from the RGBA bitmap to avoid a huge alloc.
    const targetSamples = 120000;
    const step = Math.max(1, Math.floor(Math.sqrt((W * H) / targetSamples)));
    const grayAt = (idx: number) =>
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    let bDiff = 0;
    let bN = 0;
    let iDiff = 0;
    let iN = 0;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x++) {
        const cur = grayAt((y * W + x) * 4);
        if (x > 0) {
          const d = Math.abs(cur - grayAt((y * W + x - 1) * 4));
          if (x % BLOCK === 0) {
            bDiff += d;
            bN++;
          } else {
            iDiff += d;
            iN++;
          }
        }
        if (y > 0) {
          const d = Math.abs(cur - grayAt(((y - 1) * W + x) * 4));
          if (y % BLOCK === 0) {
            bDiff += d;
            bN++;
          } else {
            iDiff += d;
            iN++;
          }
        }
      }
    }
    const boundary = bN ? bDiff / bN : 0;
    const interior = iN ? iDiff / iN : 0;
    const blockingRatio = interior > 1e-6 ? boundary / interior : 1;
    const jpegBlocking = Math.min(1, Math.max(0, (blockingRatio - 1) / 0.4));

    // --- Combine into a natural-photo score ---
    // Weights: heteroscedasticity is the decisive real fingerprint (sensor noise
    // variance grows with signal; diffusion noise is uniform). JPEG blocking and
    // micro-texture are only weak boosters; the hard gate below keeps a
    // re-compressed / uniformly-noisy AI image from slipping through.
    const hetC = Math.min(1, heteroscedasticity);
    const blkC = Math.min(1, jpegBlocking);
    const micC = Math.min(1, microTexture);
    const noiseOK = noiseLevel > 0.4 && noiseLevel < 30 ? 1 : 0;
    let natural = 0.7 * hetC + 0.15 * blkC + 0.1 * noiseOK + 0.05 * micC;
    natural = Math.min(1, natural);

    // Gate: require genuine sensor-noise heteroscedasticity before claiming real.
    let signal: TextureResult["signal"] = null;
    let score = 50;
    if (heteroscedasticity > HETERO_GATE && natural >= 0.45) {
      signal = "real";
      score = Math.round(40 - natural * 15); // 0.45 → 33, 1.0 → 25
    }

    return {
      analyzed: true,
      naturalScore: natural,
      noiseLevel,
      heteroscedasticity,
      jpegBlocking,
      microTexture,
      signal,
      score,
    };
  } catch {
    // Decoding / analysis failure — never block the main detection.
    return null;
  }
}
