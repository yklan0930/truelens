/**
 * TrueLens Multi-Engine Analyzer (v2)
 *
 * Architecture:
 *   HF ViT (Inference API)  → primary "does it look AI-generated" classifier
 *   EXIF Metadata Analysis  → MODERATOR (real / AI signal), NOT a driver
 *   Format Heuristics       → weak REAL-leaning moderator (screenshot/app export)
 *
 * Key fix vs v1:
 *   v1 did  final = HF*0.8 + EXIF*0.2, where EXIF returned 0.7 whenever metadata
 *   was absent. That pushed real-but-stripped images (screenshots, app-retouched
 *   exports, scans) over the AI threshold. v2 uses EXIF only to *moderate* the HF
 *   score, and treats "no metadata" as NEUTRAL (no push in either direction).
 *
 * Confidence calibration:
 *   When the only signal is the HF classifier and it is borderline, we honestly
 *   lower confidence and widen the "uncertain" band instead of forcing a verdict.
 */

import { detectWithHuggingFace, HFDetectionResult } from "./detectors/huggingface";
import { analyzeExif, ExifResult, type SignalLean } from "./detectors/exif";
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
  /** Structured, human-readable signal breakdown (detailed report). */
  signals?: SignalItem[];
  /** Short explanation of how confidence was calibrated (detailed report). */
  calibration?: string;
  processingTimeMs: number;
}

export interface EvidenceItem {
  source: string;
  type: "real" | "ai" | "neutral";
  label: string;
  detail: string;
}

export interface SignalItem {
  category: "vit" | "exif" | "format" | "calibration";
  label: string;
  detail: string;
  lean: SignalLean;
  /** AI-lean score 0-100 (higher = more likely AI). */
  score?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

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
  const signals: SignalItem[] = [];

  // --- HF ViT (primary) ---
  let aiProb = 0.5; // fallback if HF fails
  if (hfResult.status === "fulfilled" && hfResult.value) {
    const hf = hfResult.value;
    engines.huggingface = hf;
    aiProb = hf.aiScore;

    const hfScorePct = Math.round(hf.aiScore * 100);
    evidence.push({
      source: t("evidence.source_vit"),
      type: hf.aiScore > 0.5 ? "ai" : "real",
      label:
        hf.aiScore > 0.5
          ? t("evidence.ai_prob_label", { value: (hf.aiScore * 100).toFixed(1) })
          : t("evidence.real_prob_label", { value: (hf.humanScore * 100).toFixed(1) }),
      detail: t("evidence.hf_model_detail", { value: (hf.confidence * 100).toFixed(1) }),
    });
    signals.push({
      category: "vit",
      label: t("evidence.source_vit"),
      detail: t("evidence.hf_model_detail", { value: (hf.confidence * 100).toFixed(1) }),
      lean: hf.aiScore > 0.5 ? "ai" : "real",
      score: hfScorePct,
    });
  } else {
    evidence.push({
      source: t("evidence.source_vit"),
      type: "neutral",
      label: t("evidence.engine_unavailable"),
      detail: t("evidence.engine_unavailable_detail"),
    });
  }

  // --- EXIF (moderator) ---
  let exif: ExifResult | undefined;
  if (exifResult.status === "fulfilled" && exifResult.value) {
    exif = exifResult.value;
    engines.exif = exif;

    // Moderation: nudge the HF-based probability by the net EXIF signal.
    // net = aiStrength - realStrength  (roughly -0.75 .. +0.5)
    const net = exif.aiStrength - exif.realStrength;
    aiProb = clamp(aiProb + net * 0.15, 0.01, 0.99);

    for (const ev of exif.evidence) {
      evidence.push({
        source: t("evidence.source_exif"),
        type: ev.type,
        label: ev.label,
        detail: ev.detail,
      });
    }
    for (const s of exif.signals) {
      signals.push({
        category: "exif",
        label: s.label,
        detail: s.detail,
        lean: s.lean,
        score: s.lean === "ai" ? 75 : s.lean === "real" ? 20 : 50,
      });
    }
  }

  const aiPercentRaw = Math.round(aiProb * 100);

  // --- Confidence calibration ---
  let confidence =
    engines.huggingface?.confidence != null
      ? Math.round(engines.huggingface.confidence * 100)
      : Math.round((1 - Math.abs(aiProb - 0.5) * 2) * 100);

  let calibrationNote = "";
  const borderline = aiPercentRaw > 35 && aiPercentRaw < 65;
  const noCorroboration = !exif || (exif.aiStrength < 0.3 && exif.realStrength < 0.3);

  // Honest abstention: single classifier, borderline, no supporting signal.
  if (borderline && noCorroboration) {
    confidence = Math.min(confidence, 55);
    calibrationNote = t("evidence.calib_borderline");
  } else if (exif) {
    // Corroboration raises confidence when signals agree with the verdict.
    const agrees =
      (exif.aiStrength > 0.3 && aiPercentRaw >= 60) ||
      (exif.realStrength > 0.3 && aiPercentRaw <= 40);
    if (agrees) {
      confidence = Math.min(95, confidence + 10);
      calibrationNote = t("evidence.calib_corroborated");
    } else if (!borderline) {
      calibrationNote = t("evidence.calib_hf_only");
    }
  }

  // --- Verdict ---
  let verdict: DetectionResult["verdict"];
  const aiPercent = aiPercentRaw;
  if (aiPercent >= 65) {
    verdict = "likely_ai";
  } else if (aiPercent <= 35) {
    verdict = "likely_real";
  } else {
    verdict = "uncertain";
  }

  if (calibrationNote) {
    signals.push({
      category: "calibration",
      label: t("evidence.calibration_title"),
      detail: calibrationNote,
      lean: "neutral",
    });
  }

  return {
    aiProbability: aiPercent,
    verdict,
    confidence,
    engines,
    evidence,
    signals,
    calibration: calibrationNote || undefined,
    processingTimeMs: Date.now() - startTime,
  };
}
