/**
 * TrueLens Multi-Engine Analyzer (v3.6 — model upgrade)
 *
 * Architecture decision (2026-07-19):
 *   The free HuggingFace model (Ateeqq/ai-vs-human-image-detector) is
 *   near-binary and confidently WRONG on ~half of real photos (it returns
 *   ~100% "AI" for genuine pets, group shots, and portraits). Its companion
 *   model (dima806/deepfake-image-detector) is DEAD on the free endpoint
 *   (HTTP 400 "not supported"), as are every other dedicated AI-image
 *   detector we probed (Organika, prithivMLmods, wolverine28, kevinwang,
 *   hlxiv, nateraw, vocabdef — all 400). A probe across the 17-image QA set
 *   confirmed Ateeqq alone scores 52.9% accuracy / 50% real-recall: a coin
 *   flip that actively harms users by false-accusing their real photos.
 *
 *   The ONLY model that satisfies BOTH "catch the AI" AND "don't wrongfully
 *   accuse a real person" is a trained commercial detector. We therefore make
 *   Sightengine's `genai` model the PRIMARY image detector when its
 *   credentials (SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET) are present.
 *   Sightengine's genai works for BOTH image and video on one plan, so no
 *   extra subscription is needed — just the env vars.
 *
 *   - Sightengine configured  → it drives the verdict & AI probability. The
 *     free Ateeqq model is kept only as a cheap fallback for when Sightengine
 *     is unreachable, in which case we fall back to the conservative
 *     real-safe policy (AI only on a definitive AI-generation watermark).
 *   - Sightengine NOT configured (local dev / before key added) → the legacy
 *     real-safe fallback runs: Ateeqq as a weak signal, AI confirmed only by
 *     an actual AI-generation watermark; borderline/high scores abstain as
 *     "uncertain" rather than falsely accuse a real photo.
 */

import { detectWithHuggingFace, HFDetectionResult } from "./detectors/huggingface";
import { analyzeExif, ExifResult, type SignalLean } from "./detectors/exif";
import { detectWatermark, type WatermarkResult } from "./detectors/watermark";
import { detectAIWatermark, type AIWatermarkResult } from "./detectors/aiWatermark";
import { analyzeTexture, type TextureResult } from "./detectors/texture";
import { analyzeScreen, type ScreenResult } from "./detectors/screen";
import {
  detectAIWithSightengine,
  isSightengineImageConfigured,
  type SightengineImageResult,
} from "./detectors/sightengineImage";
import { serverT, type ServerLocale } from "@/lib/i18n/server";

export interface DetectionResult {
  aiProbability: number; // 0-100, final AI probability
  verdict: "likely_ai" | "likely_real" | "uncertain";
  confidence: number; // 0-100
  engines: {
    huggingface?: HFDetectionResult;
    huggingfaceDima?: HFDetectionResult;
    sightengine?: SightengineImageResult;
    exif?: ExifResult;
    watermark?: WatermarkResult;
    aiWatermark?: AIWatermarkResult;
    texture?: TextureResult;
    screen?: ScreenResult;
  };
  evidence: EvidenceItem[];
  /** Structured, human-readable signal breakdown (detailed report). */
  signals?: SignalItem[];
  /** Short explanation of how confidence was calibrated (detailed report). */
  calibration?: string;
  /** True when the image shows screen re-photo fingerprints (moiré / pixel grid). */
  screenRephoto?: boolean;
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

// Confidence derived from how far a 0-100 probability sits from the 50% midpoint.
// Capped at 99 — we never report absolute certainty.
const confidenceFromPercent = (p: number): number =>
  Math.round(Math.max(0, Math.min(99, Math.abs(p - 50) * 2)));

/**
 * Combine two ViT model scores (kept for API compatibility / future use).
 */
export function combineViTModels(
  primary: HFDetectionResult | null,
  secondary: HFDetectionResult | null,
): { aiProb: number; combinedScore: number } {
  if (primary && secondary) {
    const w = 0.6 * primary.aiScore + 0.4 * secondary.aiScore;
    const diff = Math.abs(primary.aiScore - secondary.aiScore);
    const aiProb = diff > 0.3 ? 0.5 + (w - 0.5) * 0.7 : w;
    return { aiProb: clamp(aiProb, 0.01, 0.99), combinedScore: w };
  }
  if (primary) return { aiProb: clamp(primary.aiScore, 0.01, 0.99), combinedScore: primary.aiScore };
  if (secondary) return { aiProb: clamp(secondary.aiScore, 0.01, 0.99), combinedScore: secondary.aiScore };
  return { aiProb: 0.5, combinedScore: 0.5 };
}

export async function analyzeImage(
  imageBuffer: Buffer,
  hfToken: string,
  filename?: string,
  locale: ServerLocale = "zh"
): Promise<DetectionResult> {
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key);

  const startTime = Date.now();

  // --- Engine selection (v3.6) ---
  // Sightengine (paid `genai`) is the PRIMARY detector when configured. The
  // free HF model (Ateeqq) is a cheap fallback used only when Sightengine is
  // unavailable (no key, or API/network error).
  const useSightengine = isSightengineImageConfigured();

  const tasks: Promise<unknown>[] = [analyzeExif(imageBuffer, filename, locale)];
  let seTaskIdx = -1;
  if (useSightengine) {
    seTaskIdx = tasks.length;
    tasks.push(detectAIWithSightengine(imageBuffer, { filename, locale }));
  }
  const hfTaskIdx = tasks.length;
  tasks.push(detectWithHuggingFace(imageBuffer, hfToken, locale, "ateeqq"));

  const settled = await Promise.allSettled(tasks);
  const exifResult = settled[0];
  const seResult = seTaskIdx >= 0 ? settled[seTaskIdx] : null;
  const hfResult = settled[hfTaskIdx];

  const primaryHF = hfResult.status === "fulfilled" ? (hfResult.value as HFDetectionResult) : null;
  const sightengine: SightengineImageResult | null =
    seResult && seResult.status === "fulfilled"
      ? (seResult.value as SightengineImageResult)
      : null;

  const engines: DetectionResult["engines"] = {};
  const evidence: EvidenceItem[] = [];
  const signals: SignalItem[] = [];

  if (primaryHF) engines.huggingface = primaryHF;

  // Base AI probability: Sightengine when available, else the free HF model.
  let aiProb: number;
  if (sightengine) {
    aiProb = sightengine.aiScore;
    engines.sightengine = sightengine;
  } else {
    aiProb = primaryHF ? primaryHF.aiScore : 0.5;
  }

  // --- Sightengine (primary) evidence ---
  if (sightengine) {
    const sePct = Math.round(sightengine.aiScore * 100);
    evidence.push({
      source: t("evidence.source_sightengine_img"),
      type: sightengine.aiScore > 0.5 ? "ai" : "real",
      label:
        sightengine.aiScore > 0.5
          ? t("evidence.ai_prob_label", { value: sePct })
          : t("evidence.real_prob_label", { value: 100 - sePct }),
      detail: t("evidence.sightengine_detail", { value: sePct }),
    });
    signals.push({
      category: "vit",
      label: t("evidence.source_sightengine_img"),
      detail: t("evidence.sightengine_detail", { value: sePct }),
      lean: sightengine.aiScore > 0.5 ? "ai" : "real",
      score: sePct,
    });
  }

  // --- Free HF model (Ateeqq) evidence — only when Sightengine is absent ---
  // In Sightengine mode we omit Ateeqq's near-binary output from the report;
  // it would only confuse users (it labels most real photos ~100% "AI"). It
  // is still computed above as a fallback if Sightengine fails.
  if (primaryHF && !sightengine) {
    const hfScorePct = Math.round(primaryHF.aiScore * 100);
    evidence.push({
      source: t("evidence.source_vit"),
      type: primaryHF.aiScore > 0.5 ? "ai" : "real",
      label:
        primaryHF.aiScore > 0.5
          ? t("evidence.ai_prob_label", { value: (primaryHF.aiScore * 100).toFixed(1) })
          : t("evidence.real_prob_label", { value: (primaryHF.humanScore * 100).toFixed(1) }),
      detail: t("evidence.hf_model_detail", {
        value: (primaryHF.confidence * 100).toFixed(1),
        model: "Ateeqq",
      }),
    });
    signals.push({
      category: "vit",
      label: t("evidence.source_vit"),
      detail: t("evidence.hf_model_detail", {
        value: (primaryHF.confidence * 100).toFixed(1),
        model: "Ateeqq",
      }),
      lean: primaryHF.aiScore > 0.5 ? "ai" : "real",
      score: hfScorePct,
    });
  }
  if (!primaryHF && !sightengine) {
    evidence.push({
      source: t("evidence.source_vit"),
      type: "neutral",
      label: t("evidence.engine_unavailable"),
      detail: t("evidence.engine_unavailable_detail"),
    });
  }

  // --- EXIF (moderator) ---
  // In Sightengine mode we keep EXIF as informational evidence but do NOT let
  // it move the score — Sightengine is the authoritative realness signal. In
  // fallback mode we keep the original moderation nudge.
  let exif: ExifResult | undefined;
  if (exifResult.status === "fulfilled" && exifResult.value) {
    exif = exifResult.value as ExifResult;
    engines.exif = exif;

    if (!sightengine) {
      const net = exif.aiStrength - exif.realStrength;
      aiProb = clamp(aiProb + net * 0.15, 0.01, 0.99);
    }

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

  // --- Retouching / beauty moderation (fallback mode only) ---
  // When Sightengine is the authority we skip the score compression; it
  // already accounts for beauty/social-app retouching. In fallback mode we
  // keep the original compression for real-photo protection.
  const hasRetouchingSignal = exif?.filenameSignals?.some(
    (s) => s.key === "filename_beauty_app" || s.key === "filename_social_app"
  );
  const hasBeautySoftwareSignal = exif?.signals.some(
    (s) => s.key === "beauty_app_software"
  );

  if (!sightengine && exif && (hasRetouchingSignal || hasBeautySoftwareSignal) && aiProb < 0.95) {
    const compression = hasBeautySoftwareSignal ? 0.30 : 0.38;
    aiProb = 0.5 + (aiProb - 0.5) * compression;
    evidence.push({
      source: t("evidence.source_exif"),
      type: "real",
      label: t("evidence.retouching_hint"),
      detail: t("evidence.retouching_hint_detail"),
    });
    signals.push({
      category: "exif",
      label: t("evidence.retouching_hint"),
      detail: t("evidence.retouching_hint_detail"),
      lean: "real",
      score: 25,
    });
  }

  // --- Watermark OCR (best-effort, fallback mode only) ---
  // Sightengine already handles real/retouched photos correctly, so we skip
  // the expensive OCR pass in Sightengine mode (it could otherwise fight the
  // authoritative score). In fallback mode we keep it for strong real-proof.
  let watermark: WatermarkResult | null = null;
  if (!sightengine && aiProb > 0.5 && aiProb < 0.95) {
    try {
      watermark = await detectWatermark(imageBuffer, hfToken, locale, 10000);
    } catch {
      watermark = null;
    }
  }
  if (watermark?.found && watermark.app) {
    engines.watermark = watermark;
    aiProb = 0.5 + (aiProb - 0.5) * 0.25;
    evidence.push({
      source: t("evidence.source_watermark"),
      type: "real",
      label: t("evidence.watermark_found"),
      detail: t("evidence.watermark_found_detail", { app: watermark.app }),
    });
    signals.push({
      category: "format",
      label: t("evidence.watermark_found"),
      detail: t("evidence.watermark_found_detail", { app: watermark.app }),
      lean: "real",
      score: 20,
    });
  }

  // --- Face / skin analysis: DISABLED (see v3.5 note) ---
  // The pure-JS skin detector fires on ANY image with skin-toned pixels and
  // cannot separate a real face from an AI face, so it provided no reliable
  // signal. A trustworthy face check needs a real ML detector.

  // --- Natural-photo texture / noise fingerprint (diagnostics only) ---
  // Kept for transparency; never moves the score (heteroscedasticity is
  // non-discriminative across the QA set).
  let texture: TextureResult | null = null;
  if (aiProb > 0.5) {
    try {
      texture = await analyzeTexture(imageBuffer);
    } catch {
      texture = null;
    }
  }
  if (texture) engines.texture = texture;

  // --- AI generation watermark (e.g. "图片由AI生成", "AI Generated") ---
  // Strong DEFINITIVE signal in BOTH modes: an AI generator's own stamp proves
  // the image is AI, so we boost (conservatively) wherever it appears.
  let aiWatermark: AIWatermarkResult | null = null;
  try {
    aiWatermark = await detectAIWatermark(imageBuffer);
  } catch {
    aiWatermark = null;
  }
  if (aiWatermark?.found) {
    engines.aiWatermark = aiWatermark;
    aiProb = clamp(0.5 + (aiProb - 0.5) * 0.7 + 0.20, 0.01, 0.97);
    evidence.push({
      source: t("evidence.source_ai_watermark"),
      type: "ai",
      label: t("evidence.ai_watermark_detected"),
      detail: t("evidence.ai_watermark_detected_detail", {
        position: aiWatermark.position || "bottom",
        confidence: aiWatermark.confidence,
      }),
    });
    signals.push({
      category: "format",
      label: t("evidence.ai_watermark_detected"),
      detail: t("evidence.ai_watermark_detected_detail", {
        position: aiWatermark.position || "bottom",
        confidence: aiWatermark.confidence,
      }),
      lean: "ai",
      score: aiWatermark.confidence,
    });
  }

  // --- Screen re-photography (annotation only) ---
  let screen: ScreenResult | null = null;
  if (aiProb > 0.5 && !aiWatermark?.found) {
    try {
      screen = await analyzeScreen(imageBuffer);
    } catch {
      screen = null;
    }
  }
  if (screen?.isScreenCapture) {
    engines.screen = screen;
    evidence.push({
      source: t("evidence.source_screen"),
      type: "neutral",
      label: t("evidence.screen_detected"),
      detail: t("evidence.screen_detected_detail"),
    });
    signals.push({
      category: "format",
      label: t("evidence.screen_detected"),
      detail: t("evidence.screen_detected_detail"),
      lean: "neutral",
      score: 50,
    });
  }

  const aiPercentRaw = Math.round(aiProb * 100);

  // --- Confidence + verdict ---
  let confidence: number;
  let verdict: DetectionResult["verdict"];
  let calibrationNote = "";

  if (sightengine) {
    // Sightengine-driven: calibrated threshold on its `genai` probability.
    const aiPercent = aiPercentRaw;
    confidence = confidenceFromPercent(aiPercent);

    // Corroboration: if the free Ateeqq model agrees with the direction,
    // raise confidence a little (both engines pointing the same way).
    if (primaryHF) {
      const agree =
        (primaryHF.aiScore > 0.5 && aiPercent >= 50) ||
        (primaryHF.aiScore <= 0.5 && aiPercent < 50);
      if (agree) confidence = Math.min(99, confidence + 10);
    }

    const aiConfirmed = !!aiWatermark?.found && aiPercent >= 60;
    if (aiConfirmed) {
      verdict = "likely_ai";
    } else if (aiPercent >= 70) {
      verdict = "likely_ai";
    } else if (aiPercent <= 30) {
      verdict = "likely_real";
    } else {
      verdict = "uncertain";
    }
    if (aiPercent >= 70 || aiPercent <= 30) {
      calibrationNote = t("evidence.calib_corroborated");
    } else {
      calibrationNote = t("evidence.calib_borderline");
    }
  } else {
    // Fallback (real-safe) policy.
    confidence =
      engines.huggingface?.confidence != null
        ? Math.round(engines.huggingface.confidence * 100)
        : Math.round((1 - Math.abs(aiProb - 0.5) * 2) * 100);

    const borderline = aiPercentRaw > 35 && aiPercentRaw < 65;
    const noCorroboration = !exif || (exif.aiStrength < 0.3 && exif.realStrength < 0.3);

    if (borderline && noCorroboration) {
      confidence = Math.min(confidence, 55);
      calibrationNote = t("evidence.calib_borderline");
    } else if (exif) {
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

    const realThreshold = 35;
    const aiConfirmed = !!aiWatermark?.found && aiPercentRaw >= 60;
    if (aiConfirmed) {
      verdict = "likely_ai";
    } else if (aiPercentRaw <= realThreshold) {
      verdict = "likely_real";
    } else {
      verdict = "uncertain";
    }
  }

  if (calibrationNote) {
    signals.push({
      category: "calibration",
      label: t("evidence.calibration_title"),
      detail: calibrationNote,
      lean: "neutral",
    });
  }

  // An AI-generated image is never a "photo of a screen", so a screen
  // re-photo flag on an AI verdict is a false positive — suppress it (and the
  // confidence penalty). The screen-rephoto tip only makes sense for real
  // photos that might be mis-judged as AI.
  const isAIGenerated = verdict === "likely_ai";
  if (screen?.isScreenCapture && aiPercentRaw >= 60 && !isAIGenerated) {
    confidence = Math.min(confidence, 60);
  }

  // Never report absolute certainty.
  confidence = Math.min(99, confidence);
  const aiProbabilityDisplay = Math.min(99, Math.max(1, aiPercentRaw));

  return {
    aiProbability: aiProbabilityDisplay,
    verdict,
    confidence,
    engines,
    evidence,
    signals,
    calibration: calibrationNote || undefined,
    screenRephoto: !!screen?.isScreenCapture && !isAIGenerated,
    processingTimeMs: Date.now() - startTime,
  };
}
