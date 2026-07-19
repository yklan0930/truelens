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
import { detectWatermark, type WatermarkResult } from "./detectors/watermark";
import { detectAIWatermark, type AIWatermarkResult } from "./detectors/aiWatermark";
import { analyzeTexture, type TextureResult } from "./detectors/texture";
import { analyzeScreen, type ScreenResult } from "./detectors/screen";
import { serverT, type ServerLocale } from "@/lib/i18n/server";

export interface DetectionResult {
  aiProbability: number; // 0-100, final AI probability
  verdict: "likely_ai" | "likely_real" | "uncertain";
  confidence: number; // 0-100
  engines: {
    huggingface?: HFDetectionResult;
    huggingfaceDima?: HFDetectionResult;
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

/**
 * Combine the two ViT model scores into a single ai probability (0..1).
 * - Both succeed: 0.6 * primary + 0.4 * secondary (Ateeqq is generally more
 *   accurate on the kinds of images we see, so it gets a higher weight).
 *   If they DISAGREE strongly (|diff| > 0.3), pull the result toward 0.5
 *   by 30% to express "models disagree -> uncertain".
 * - Only one succeeds: use that one (don't penalize the user for a single
 *   model hiccup).
 * - Both fail: 0.5 (neutral fallback).
 */
export function combineViTModels(
  primary: HFDetectionResult | null,
  secondary: HFDetectionResult | null,
): { aiProb: number; combinedScore: number } {
  if (primary && secondary) {
    const w = 0.6 * primary.aiScore + 0.4 * secondary.aiScore;
    const diff = Math.abs(primary.aiScore - secondary.aiScore);
    // Strong disagreement: pull 30% toward neutral
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
    serverT(locale, key, params);

  const startTime = Date.now();

  // Run all engines in parallel.
  // - 2 HF vision models (Ateeqq primary, dima806 secondary) — averaged
  //   with a 0.6 / 0.4 weighting, see `combineViTModels` below.
  // - EXIF metadata analysis (moderator)
  const [hfPrimary, hfSecondary, exifResult] = await Promise.allSettled([
    detectWithHuggingFace(imageBuffer, hfToken, locale, "ateeqq"),
    detectWithHuggingFace(imageBuffer, hfToken, locale, "dima806"),
    analyzeExif(imageBuffer, filename, locale),
  ]);

  const engines: DetectionResult["engines"] = {};
  const evidence: EvidenceItem[] = [];
  const signals: SignalItem[] = [];

  // --- HF ViT ensemble (primary + secondary model) ---
  // If both succeed, weighted average. If only one succeeds, use that one.
  // If both fail, fall back to 0.5 with an "engine unavailable" evidence item.
  const primaryHF = hfPrimary.status === "fulfilled" ? hfPrimary.value : null;
  const secondaryHF = hfSecondary.status === "fulfilled" ? hfSecondary.value : null;

  if (primaryHF) engines.huggingface = primaryHF;
  if (secondaryHF) engines.huggingfaceDima = secondaryHF;

  const combined = combineViTModels(primaryHF, secondaryHF);
  let aiProb = combined.aiProb;

  // Per-model evidence
  if (primaryHF) {
    const hfScorePct = Math.round(primaryHF.aiScore * 100);
    evidence.push({
      source: t("evidence.source_vit"),
      type: primaryHF.aiScore > 0.5 ? "ai" : "real",
      label: primaryHF.aiScore > 0.5
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
  if (secondaryHF) {
    const dScorePct = Math.round(secondaryHF.aiScore * 100);
    evidence.push({
      source: t("evidence.source_vit_dima"),
      type: secondaryHF.aiScore > 0.5 ? "ai" : "real",
      label: secondaryHF.aiScore > 0.5
        ? t("evidence.ai_prob_label", { value: (secondaryHF.aiScore * 100).toFixed(1) })
        : t("evidence.real_prob_label", { value: (secondaryHF.humanScore * 100).toFixed(1) }),
      detail: t("evidence.hf_model_detail", {
        value: (secondaryHF.confidence * 100).toFixed(1),
        model: "dima806",
      }),
    });
    signals.push({
      category: "vit",
      label: t("evidence.source_vit_dima"),
      detail: t("evidence.hf_model_detail", {
        value: (secondaryHF.confidence * 100).toFixed(1),
        model: "dima806",
      }),
      lean: secondaryHF.aiScore > 0.5 ? "ai" : "real",
      score: dScorePct,
    });
  }
  if (!primaryHF && !secondaryHF) {
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

  // --- Retouching / beauty moderation ---
  // Beauty apps and social-compressed real photos share surface-level statistics
  // with AI generations (smooth skin, sharpened eyes, homogenous tones). If we
  // see filename or EXIF indicators of such processing, we lower the AI
  // probability more aggressively, but only when the visual model is not
  // extremely confident (aiScore >= 0.95 is treated as a genuine AI signal).
  const hasRetouchingSignal = exif?.filenameSignals?.some(
    (s) => s.key === "filename_beauty_app" || s.key === "filename_social_app"
  );
  const hasBeautySoftwareSignal = exif?.signals.some(
    (s) => s.key === "beauty_app_software"
  );

  if (exif && (hasRetouchingSignal || hasBeautySoftwareSignal) && aiProb < 0.95) {
    // Beauty / social-compressed real photos share surface-level statistics with
    // AI generations (smooth skin, sharpened eyes, homogenous tones). When such
    // indicators are present, we compress the AI probability toward 0.5 instead
    // of a flat subtraction, because the visual model alone is not reliable here.
    //
    // Compression factor (lower = stronger pull toward "uncertain"):
    //   0.30 — beauty app name in EXIF Software field (strongest real evidence)
    //   0.38 — social-app filename only (weaker but still informative)
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

  // --- Watermark OCR (best-effort, conditional) ---
  // Retouching / beauty apps (轻颜, 美图, B612...) embed a brand watermark that
  // proves the image is an EDITED REAL photo, not AI. We only spend the
  // (relatively expensive) OCR pass when the visual model is ambiguous-to-
  // suspicious; clearly-real or extremely-confident-AI cases skip it.
  let watermark: WatermarkResult | null = null;
  if (aiProb > 0.5 && aiProb < 0.95) {
    try {
      watermark = await detectWatermark(imageBuffer, hfToken, locale, 10000);
    } catch {
      watermark = null;
    }
  }
  if (watermark?.found && watermark.app) {
    engines.watermark = watermark;
    // Strong REAL signal: a visible brand watermark is near-definitive proof
    // that this is a real photo passed through an editing pipeline — NOT AI.
    // Apply the strongest compression of all signals.
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

  // --- Face / skin analysis (best-effort, conditional) ---
  // A detected human portrait is strong evidence of a REAL photograph; smoothed
  // skin inside that portrait points to a beauty-filter / retouching pipeline.
  // IMPORTANT: we removed the upper confidence gate (< 0.98) that previously
  // prevented this check from running on high-confidence ViT scores. That gate
  // created a blind spot where real photos falsely scored 95–99% AI because
  // NO anti-FP detector was allowed to run. We now always check when the visual
  // model is AI-suspicious (aiProb > 0.5), regardless of how confident it is.
  // v3.5: face/skin-based score compression is DISABLED. The pure-JS skin
  // detector fires on ANY image with skin-toned pixels (sand, rocks, food) —
  // at every isSkin threshold it reports faceFound=true for 16/17 test images.
  // It cannot separate a real face from scenery, and cannot separate a real
  // face from an AI face (Ateeqq scores both ~100%). So it provided no reliable
  // signal and only squashed catchable AI. A trustworthy face check needs a
  // real ML detector (blocked on Vercel WASM) or a stronger vision model.
  // (Face/skin analysis intentionally not run — see note above.)

  // --- Natural-photo texture / noise fingerprint (diagnostics only) ---
  // NOTE (v3.5): Empirical QA across the full test set showed that
  // heteroscedasticity — the metric this detector leans on — is NON-
  // discriminative. It is HIGH on both AI images (ai-food 85%, ai-mountain-
  // thumb 63%, ai-portrait 56%) AND real images (real-street 52%, real-food
  // 35%). The old "real" compression therefore HURT AI detection (squashing
  // catchable ai-food / ai-mountain-thumb toward "uncertain") while giving no
  // reliable real-photo protection — non-face reals were never accused anyway,
  // because Ateeqq already returns them ~50% (borderline) rather than 100%.
  // We keep the measurement in `engines.texture` for transparency but NO LONGER
  // let it move the score. A trustworthy AI/real discriminator for non-face
  // images requires a stronger vision model (see roadmap: paid/Sightengine).
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
  // Strong signal: most major AI image generators stamp a watermark on their
  // output. If we see one, this image is DEFINITELY AI-generated — the
  // screen-detection fingerprint (moiré / sub-pixel grid) sometimes false-
  // positives on these images, so we also SKIP the screen check entirely.
  let aiWatermark: AIWatermarkResult | null = null;
  try {
    aiWatermark = await detectAIWatermark(imageBuffer);
  } catch {
    aiWatermark = null;
  }
  if (aiWatermark?.found) {
    engines.aiWatermark = aiWatermark;
    // Moderate boost: 0.20 nudge toward AI (was 0.30). Kept conservative
    // because false-positive watermarks were previously pushing real photos
    // (Ateeqq 0%, or face-compressed 61%) back up to 51-87%.
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

  // --- Screen re-photography (best-effort, ANNOTATION ONLY) ---
  // A phone photo OF a screen (a screenshot / slide / webpage re-photographed)
  // is a genuine capture, but its moiré / sub-pixel-grid fingerprints make the
  // vision model mis-flag it as AI. We deliberately do NOT soften the AI score
  // here — doing so would let real AI images slip through. Instead we only
  // ANNOTATE the result as "likely unreliable" and lower confidence below, so
  // the user knows to judge with context.
  // SKIP entirely if we already detected an AI watermark — those images are
  // definitively AI, and the moiré/screen fingerprint sometimes false-positives
  // on them too.
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

  // A screen re-photo that the model flags as AI is a known false-positive
  // class; lower confidence so the verdict reads as "unreliable, check context".
  if (screen?.isScreenCapture && aiPercentRaw >= 60) {
    confidence = Math.min(confidence, 60);
  }

  // --- Verdict (v3.5, real-safe policy) ---
  // The free HF vision model (Ateeqq) is near-binary and confidently wrong on
  // roughly half of real photos (it returns ~100% "AI" for genuine portraits,
  // pets, and group shots). With our second model (dima806) dead on the free
  // endpoint and no reliable local face detector, we CANNOT separate an AI
  // face/portrait from a real one. Falsely accusing a user's real photo is the
  // worse failure (it directly harms them), so we adopt a conservative,
  // real-safe policy:
  //   - A real photo is only ever "likely_ai" if there is a DEFINITIVE,
  //     independent AI signal (an actual AI-generation watermark).
  //   - Otherwise a borderline/high score is reported as "uncertain" — honest
  //     abstention rather than a false verdict.
  // This protects real photos (the user's stated priority) at the cost of AI
  // recall; restoring AI detection requires a stronger/paid model (roadmap).
  let verdict: DetectionResult["verdict"];
  const aiPercent = aiPercentRaw;
  const realThreshold = 35;
  const aiConfirmed = !!aiWatermark?.found && aiPercent >= 60;
  if (aiConfirmed) {
    verdict = "likely_ai";
  } else if (aiPercent <= realThreshold) {
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

  // Never report absolute certainty. Cap confidence at 99 and clamp the AI
  // probability to [1, 99] so no result reads as a disputable "100% / 0%".
  // Verdict is already decided above from the raw percentage, so this only
  // affects the displayed numbers.
  confidence = Math.min(99, confidence);
  const aiProbabilityDisplay = Math.min(99, Math.max(1, aiPercent));

  return {
    aiProbability: aiProbabilityDisplay,
    verdict,
    confidence,
    engines,
    evidence,
    signals,
    calibration: calibrationNote || undefined,
    screenRephoto: screen?.isScreenCapture ?? false,
    processingTimeMs: Date.now() - startTime,
  };
}
