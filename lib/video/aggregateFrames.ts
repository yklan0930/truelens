// Aggregate N per-frame image detection results into a single VideoResult.
// The free "frames" engine path: client extracts frames, sends each to
// /api/detect, then this function combines them.

import {
  type VideoResult,
  type VideoEvidenceItem,
  verdictFromProbability,
  confidenceFromProbability,
} from "./types";

export interface FrameDetection {
  aiProbability: number; // 1..99
  confidence: number;
  signals: Array<{
    category: string;
    label: string;
    detail: string;
    lean: "ai" | "real" | "neutral";
    score?: number;
  }>;
}

export function aggregateFrameResults(
  frames: FrameDetection[],
  meta: { fileName?: string; fileSize?: number; durationSec?: number }
): VideoResult {
  if (frames.length === 0) {
    throw new Error("No frame results to aggregate");
  }

  // Use MAX (worst case) + MEAN (overall) for robustness:
  //  - Max catches a single strongly-AI frame even if others are clean
  //    (a real video will have all frames look similar; an AI video might
  //    have one giveaway frame while others are good).
  //  - Mean reflects the overall proportion of AI-looking frames.
  const scores = frames.map((f) => f.aiProbability);
  const maxScore = Math.max(...scores);
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Weighted: 0.4*max + 0.6*mean — favors "any frame looks AI" while
  // preventing a single noisy frame from dominating.
  const prob = 0.4 * maxScore + 0.6 * meanScore;
  const aiProbability = Math.min(99, Math.max(1, Math.round(prob)));

  const verdict = verdictFromProbability(aiProbability);
  const confidence = confidenceFromProbability(aiProbability);

  // Per-frame evidence: highlight frames with extreme scores.
  const flagged = frames
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.aiProbability >= 70 || f.aiProbability <= 30)
    .slice(0, 4);

  const evidence: VideoEvidenceItem[] = [
    {
      source: "frame-aggregation",
      type:
        aiProbability >= 70
          ? "ai"
          : aiProbability <= 30
            ? "real"
            : "neutral",
      label:
        verdict === "likely_ai"
          ? "AI 生成视频特征明显"
          : verdict === "likely_real"
            ? "未见明显 AI 生成痕迹"
            : "存在混合信号，建议人工复核",
      detail: `${frames.length} 帧聚合：均值 ${meanScore.toFixed(1)}% / 最高 ${maxScore}%`,
    },
  ];

  for (const { f, i } of flagged) {
    evidence.push({
      source: `frame-${i + 1}`,
      type: f.aiProbability >= 70 ? "ai" : "real",
      label: `第 ${i + 1} 帧 AI 概率 ${f.aiProbability}%`,
      detail:
        f.aiProbability >= 70
          ? "该帧呈现 AI 生成图片特征"
          : "该帧与真实照片特征一致",
    });
  }

  const summary =
    verdict === "likely_ai"
      ? `该视频高度疑似由 AI 生成（聚合概率 ${aiProbability}%）`
      : verdict === "likely_real"
        ? `该视频未见明显 AI 生成痕迹（聚合概率 ${aiProbability}%）`
        : `结果不确定（聚合 AI 概率 ${aiProbability}%），建议结合其他线索复核`;

  return {
    aiProbability,
    verdict,
    confidence,
    summary,
    evidence,
    engine: "frames",
    processingTimeMs: 0,
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    durationSec: meta.durationSec,
    framesAnalyzed: frames.length,
    perFrameScores: scores,
  };
}
