// Local / demo engine. Produces a plausible VideoResult WITHOUT calling any
// external API, so the entire async UX (upload → queued → analyzing → result)
// is exercisable when Sightengine keys are absent. The output is deterministic
// per file (seeded by name+size) so re-checks are stable.

import {
  type VideoResult,
  type VideoEvidenceItem,
  verdictFromProbability,
  confidenceFromProbability,
} from "./types";

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff; // 0..1
}

export interface MockMeta {
  fileName?: string;
  fileSize?: number;
}

export function synthesizeVideoResult(meta: MockMeta = {}): VideoResult {
  const key = `${meta.fileName || "video"}-${meta.fileSize || 0}`;
  const r1 = seedFrom(key);
  const r2 = seedFrom(key + "x");
  // Bias toward the "uncertain" / lower band so the demo shows realistic variety.
  const aiProbability = Math.round(8 + r1 * 84); // 8..92
  const verdict = verdictFromProbability(aiProbability);
  const confidence = confidenceFromProbability(aiProbability);
  const frames = 20 + Math.floor(r2 * 80); // 20..99
  const durationSec = 5 + Math.floor(r1 * 55); // 5..59s

  const evidence: VideoEvidenceItem[] = [
    {
      source: "genai-video (mock)",
      type: aiProbability >= 70 ? "ai" : aiProbability <= 30 ? "real" : "neutral",
      label:
        aiProbability >= 70
          ? "AI 生成视频特征明显"
          : aiProbability <= 30
            ? "未见明显 AI 生成痕迹"
            : "存在混合信号，建议人工复核",
      detail: `[演示模式] 模型整体 AI 概率 ${aiProbability}%`,
    },
    {
      source: "frames",
      type: "neutral",
      label: `共分析 ${frames} 帧`,
      detail: `采样帧数 ${frames}，时长约 ${durationSec}s`,
    },
  ];

  const summary =
    verdict === "likely_ai"
      ? `该视频高度疑似由 AI 生成（概率 ${aiProbability}%）`
      : verdict === "likely_real"
        ? `该视频未见明显 AI 生成痕迹（概率 ${aiProbability}%）`
        : `结果不确定（AI 概率 ${aiProbability}%），建议结合其他线索复核`;

  return {
    aiProbability,
    verdict,
    confidence,
    summary,
    evidence,
    engine: "mock",
    processingTimeMs: 0,
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    durationSec,
    framesAnalyzed: frames,
  };
}

// How long a mock job stays "processing" before the status endpoint flips it
// to done (simulates real async analysis latency).
export const MOCK_PROCESSING_MS = 4000;
