// Per-frame video detection for the free "frames" engine.
//
// Each extracted frame is scored by Sightengine's `genai` image model — the
// SAME model already used for still-image detection (one plan, image + video).
// This is the bridge until we can afford Sightengine's native MOVIE detection
// (the async `sightengine` engine, gated to paid/admin in resolveVideoEngine).
//
// Why this exists (v3.7.1 hardening):
//   The previous implementation ran `analyzeImage` over all frames inside a
//   single `Promise.all`, which on Sightengine's free tier (1 req/s) got
//   rate-limited (HTTP 429) and silently fell back every throttled frame to
//   {aiProbability: 50, confidence: 0} — degrading the whole video to
//   "uncertain". We now serialize with a ≥1.1s gap and retry on 429, so the
//   free tier produces clean per-frame scores instead of noise. We also call
//   the lightweight `detectAIWithSightengine` directly (not the full
//   `analyzeImage`), so we don't waste ops running EXIF/texture/screen/Ateeqq
//   on every single frame.

import { detectAIWithSightengine, isSightengineImageConfigured } from "@/lib/detectors/sightengineImage";
import { analyzeImage } from "@/lib/analyzer";
import type { FrameDetection } from "./aggregateFrames";

// Stay just under Sightengine's free-tier 1 req/s. Measured between the start
// of consecutive Sightengine requests so cross-request calls (multiple users)
// are also throttled.
const MIN_GAP_MS = 1100;
let lastCallStart = 0;
async function rateGate() {
  const now = Date.now();
  const wait = MIN_GAP_MS - (now - lastCallStart);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallStart = Date.now();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scoreFrameWithSE(buf: Buffer, name: string): Promise<FrameDetection> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rateGate();
      const r = await detectAIWithSightengine(buf, { filename: name, locale: "zh" });
      const p = Math.round((r.aiScore ?? 0.5) * 100);
      const ap = Math.min(99, Math.max(1, p));
      return {
        aiProbability: ap,
        confidence: ap >= 70 || ap <= 30 ? 82 : 55,
        signals: [],
      };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Only retry on rate-limit; surface other errors immediately.
      if (!/429|limit|频率|请求过于频繁|rate/i.test(msg)) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function scoreFrameFallback(buf: Buffer, name: string): Promise<FrameDetection> {
  const res = await analyzeImage(buf, process.env.HF_TOKEN || "", name, "zh");
  return {
    aiProbability: res.aiProbability,
    confidence: res.confidence,
    signals: (res.signals || []).map((s) => ({
      category: s.category,
      label: s.label,
      detail: s.detail,
      lean: s.lean,
      score: s.score,
    })),
  };
}

/**
 * Score an ordered list of video frames. Uses Sightengine per frame when
 * configured (the normal path), otherwise falls back to the full analyzer.
 * A single failed frame never crashes the batch — it degrades to a neutral
 * score so aggregation still works.
 */
export async function detectFrames(
  frames: { buf: Buffer; name: string }[]
): Promise<FrameDetection[]> {
  const useSE = isSightengineImageConfigured();
  const out: FrameDetection[] = [];
  for (const { buf, name } of frames) {
    try {
      out.push(useSE ? await scoreFrameWithSE(buf, name) : await scoreFrameFallback(buf, name));
    } catch {
      out.push({ aiProbability: 50, confidence: 0, signals: [] });
    }
  }
  return out;
}
