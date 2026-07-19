// Shared types for the async video (AI / deepfake) detection feature.
// `VideoResult` is intentionally aligned with the image `DetectionResult`
// shape consumed by the share card / result components, so the two media
// types can share the same UI.

export type VideoVerdict = "likely_ai" | "likely_real" | "uncertain";

export type VideoJobStatus = "pending" | "processing" | "done" | "failed";

export interface VideoEvidenceItem {
  source: string;
  type: "real" | "ai" | "neutral";
  label: string;
  detail: string;
}

export interface VideoResult {
  aiProbability: number; // 0-100, final AI probability
  verdict: VideoVerdict;
  confidence: number; // 0-100
  summary: string; // human-readable one-liner
  evidence: VideoEvidenceItem[];
  engine: string; // "sightengine" | "replicate" | "frames" | "mock"
  processingTimeMs: number;
  fileName?: string;
  fileSize?: number;
  durationSec?: number; // when the engine reports it
  framesAnalyzed?: number;
  perFrameScores?: number[]; // for "frames" engine — AI prob per frame
}

export function verdictFromProbability(prob: number): VideoVerdict {
  if (prob >= 70) return "likely_ai";
  if (prob <= 30) return "likely_real";
  return "uncertain";
}

// Confidence derived from how far the probability sits from the 50% midpoint.
// Capped at 99 — we never report absolute certainty (leaves room, avoids disputes).
export function confidenceFromProbability(prob: number): number {
  const c = Math.abs(prob - 50) * 2; // 0 at 50%, 100 at 0/100%
  return Math.round(Math.max(0, Math.min(99, c)));
}
