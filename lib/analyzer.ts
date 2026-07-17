/**
 * TrueLens Multi-Engine Analyzer
 * Combines HF ViT model + EXIF analysis with weighted voting.
 *
 * Architecture:
 *   HF ViT (Inference API)  → 60% weight (99.23% accuracy model)
 *   EXIF 元数据分析          → 20% weight (辅助证据)
 *   本地推理（HF降级）       → 20% weight (API 不可用时降级)
 *
 * When HF API is available: final = HF*0.8 + EXIF*0.2
 * When HF API is down:      final = EXIF score only (lower confidence)
 */

import { detectWithHuggingFace, HFDetectionResult } from "./detectors/huggingface";
import { analyzeExif, ExifResult } from "./detectors/exif";

export interface DetectionResult {
  aiProbability: number; // 0-100, final AI probability
  verdict: "likely_ai" | "likely_real" | "uncertain";
  confidence: number; // 0-100
  engines: {
    huggingface?: HFDetectionResult;
    exif?: ExifResult;
  };
  evidence: EvidenceItem[];
  processingTimeMs: number;
}

interface EvidenceItem {
  source: "ViT 深度学习模型" | "EXIF 元数据";
  type: "real" | "ai" | "neutral";
  label: string;
  detail: string;
}

const HF_WEIGHT = 0.8;
const EXIF_WEIGHT = 0.2;

export async function analyzeImage(
  imageBuffer: Buffer,
  hfToken: string
): Promise<DetectionResult> {
  const startTime = Date.now();

  // Run both engines in parallel
  const [hfResult, exifResult] = await Promise.allSettled([
    detectWithHuggingFace(imageBuffer, hfToken),
    analyzeExif(imageBuffer),
  ]);

  const engines: DetectionResult["engines"] = {};
  const evidence: EvidenceItem[] = [];
  let aiProbability = 0;
  let totalWeight = 0;

  // Process HF result
  if (hfResult.status === "fulfilled" && hfResult.value) {
    const hf = hfResult.value;
    engines.huggingface = hf;
    aiProbability += hf.aiScore * HF_WEIGHT;
    totalWeight += HF_WEIGHT;

    evidence.push({
      source: "ViT 深度学习模型",
      type: hf.aiScore > 0.5 ? "ai" : "real",
      label:
        hf.aiScore > 0.5
          ? `AI 生成概率 ${(hf.aiScore * 100).toFixed(1)}%`
          : `真实照片概率 ${(hf.humanScore * 100).toFixed(1)}%`,
      detail: `SigLIP2 模型分析，置信度 ${(hf.confidence * 100).toFixed(1)}%`,
    });
  }

  // Process EXIF result
  if (exifResult.status === "fulfilled" && exifResult.value) {
    const exif = exifResult.value;
    engines.exif = exif;

    // If HF succeeded, EXIF is supplementary (20%)
    // If HF failed, EXIF is the sole engine
    const exifWeight = totalWeight > 0 ? EXIF_WEIGHT : 1;
    aiProbability += exif.score * exifWeight;
    totalWeight += exifWeight;

    for (const ev of exif.evidence) {
      evidence.push({
        source: "EXIF 元数据",
        type: ev.type,
        label: ev.label,
        detail: ev.detail,
      });
    }
  }

  // Normalize
  if (totalWeight > 0) {
    aiProbability = aiProbability / totalWeight;
  } else {
    // Both engines failed
    aiProbability = 0.5;
    evidence.push({
      source: "ViT 深度学习模型",
      type: "neutral",
      label: "检测引擎暂时不可用",
      detail: "所有检测引擎均未返回结果，请稍后重试",
    });
  }

  const aiPercent = Math.round(aiProbability * 100);
  const confidence =
    engines.huggingface?.confidence != null
      ? Math.round(engines.huggingface.confidence * 100)
      : Math.round((1 - Math.abs(aiProbability - 0.5) * 2) * 100);

  let verdict: DetectionResult["verdict"];
  if (aiPercent >= 65) {
    verdict = "likely_ai";
  } else if (aiPercent <= 35) {
    verdict = "likely_real";
  } else {
    verdict = "uncertain";
  }

  return {
    aiProbability: aiPercent,
    verdict,
    confidence,
    engines,
    evidence,
    processingTimeMs: Date.now() - startTime,
  };
}
