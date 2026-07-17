/**
 * TrueLens Multi-Engine Analyzer
 * Combines HF ViT model + EXIF analysis with weighted voting.
 *
 * Architecture:
 *   HF ViT (Inference API)  → 80% weight
 *   EXIF Metadata Analysis  → 20% weight
 *
 * When HF API is available: final = HF*0.8 + EXIF*0.2
 * When HF API is down:      final = EXIF score only (lower confidence)
 */

import { detectWithHuggingFace, HFDetectionResult } from "./detectors/huggingface";
import { analyzeExif, ExifResult } from "./detectors/exif";
import { serverT, type ServerLocale } from "@/lib/i18n/server";

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
  source: string;
  type: "real" | "ai" | "neutral";
  label: string;
  detail: string;
}

const HF_WEIGHT = 0.8;
const EXIF_WEIGHT = 0.2;

export async function analyzeImage(
  imageBuffer: Buffer,
  hfToken: string,
  locale: ServerLocale = "zh"
): Promise<DetectionResult> {
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  const startTime = Date.now();

  // Run both engines in parallel
  const [hfResult, exifResult] = await Promise.allSettled([
    detectWithHuggingFace(imageBuffer, hfToken, locale),
    analyzeExif(imageBuffer, locale),
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
      source: t("evidence.source_vit"),
      type: hf.aiScore > 0.5 ? "ai" : "real",
      label:
        hf.aiScore > 0.5
          ? t("evidence.ai_prob_label", { value: (hf.aiScore * 100).toFixed(1) })
          : t("evidence.real_prob_label", { value: (hf.humanScore * 100).toFixed(1) }),
      detail: t("evidence.hf_model_detail", { value: (hf.confidence * 100).toFixed(1) }),
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
        source: t("evidence.source_exif"),
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
      source: t("evidence.source_vit"),
      type: "neutral",
      label: t("evidence.engine_unavailable"),
      detail: t("evidence.engine_unavailable_detail"),
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
