/**
 * EXIF Metadata Analyzer (v2)
 *
 * Design change vs v1:
 *   v1 returned score=0.7 ("likely AI") whenever EXIF was absent. That caused
 *   REAL photos whose metadata had been stripped (screenshots, app-retouched
 *   exports, scans, social-compressed files) to be falsely flagged as AI.
 *
 *   v2 treats "no EXIF" as NEUTRAL (no lean toward either side) and only leans
 *   AI when there is a concrete AI signature (e.g. "Photoshop Generative").
 *   A faint format heuristic (PNG/WebP with no EXIF often = screenshot / app
 *   export / digital art, which is typically REAL content) is added as a weak
 *   REAL-leaning signal. The analyzer uses these as a MODERATOR, not a driver.
 *
 * Output:
 *   - score / category / realStrength / aiStrength  → moderator signals
 *   - signals[]  → structured, human-readable breakdown for the detailed report
 */

import exifr from "exifr";
import { serverT, type ServerLocale } from "@/lib/i18n/server";

export type SignalLean = "real" | "ai" | "neutral";

export interface ExifSignal {
  key: string;
  label: string;
  detail: string;
  lean: SignalLean;
  /** Contribution to AI-lean, roughly -1..1 (negative = pushes toward REAL). */
  weight: number;
}

export type ImageFormat = "jpeg" | "png" | "webp" | "unknown";

export interface ExifResult {
  score: number; // 0-1, AI lean (moderator only)
  hasExif: boolean;
  fieldCount: number;
  category: SignalLean; // overall EXIF verdict
  realStrength: number; // 0-1 strength of real-evidence
  aiStrength: number; // 0-1 strength of AI-evidence
  format: ImageFormat;
  evidence: ExifEvidence[];
  signals: ExifSignal[];
}

interface ExifEvidence {
  type: "real" | "ai" | "neutral";
  label: string;
  detail: string;
}

// Fields that indicate a real camera captured this image
const REAL_CAMERA_FIELDS = [
  "Make",
  "Model",
  "LensModel",
  "FocalLength",
  "FNumber",
  "ExposureTime",
  "ISO",
  "DateTimeOriginal",
  "GPSLatitude",
  "GPSLongitude",
  "WhiteBalance",
  "ExposureProgram",
  "MeteringMode",
  "Software",
];

// Software signatures that indicate AI generation
const AI_SOFTWARE_SIGNATURES = [
  "midjourney",
  "dall-e",
  "dalle",
  "stable diffusion",
  "stablediffusion",
  "comfyui",
  "automatic1111",
  "flux",
  "firefly",
  "photoshop generative", // Photoshop's generative fill
  "gimp", // Sometimes used with AI plugins
];

/** Detect image container format from magic bytes (not reliant on extension). */
export function detectFormat(buffer: Buffer): ImageFormat {
  if (buffer.length < 12) return "unknown";
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "png";
  // WebP: RIFF ???? WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return "webp";
  return "unknown";
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export async function analyzeExif(
  imageBuffer: Buffer,
  locale: ServerLocale = "zh"
): Promise<ExifResult> {
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  const format = detectFormat(imageBuffer);
  const evidence: ExifEvidence[] = [];
  const signals: ExifSignal[] = [];

  let exifData: Record<string, unknown> | null = null;
  try {
    exifData = await exifr.parse(imageBuffer, {
      iptc: true,
      ifd0: {},
      exif: true,
      gps: true,
    });
  } catch {
    // Corrupt / unsupported container — NEUTRAL, not AI.
    return buildNeutral(format, t, "evidence.parse_failed", "evidence.parse_failed_detail");
  }

  const hasAny = !!exifData && Object.keys(exifData).length > 0;

  // --- No metadata at all: NEUTRAL with a format-aware hint ---
  if (!hasAny) {
    if (format === "png" || format === "webp") {
      return buildNeutral(
        format,
        t,
        "evidence.no_exif_digital",
        "evidence.no_exif_digital_detail"
      );
    }
    return buildNeutral(format, t, "evidence.no_exif", "evidence.no_exif_detail_real");
  }

  const meta = exifData!; // guaranteed non-null past the !hasAny return above
  let realStrength = 0;
  let aiStrength = 0;

  // Count real camera fields present
  const presentFields = REAL_CAMERA_FIELDS.filter(
    (field) => meta[field] !== undefined && meta[field] !== null
  );

  if (presentFields.length >= 3) {
    realStrength += 0.45;
    evidence.push({
      type: "real",
      label: t("evidence.camera_fields_complete"),
      detail: t("evidence.camera_fields_complete_detail", {
        count: presentFields.length,
        fields: presentFields.slice(0, 5).join(", "),
        suffix: presentFields.length > 5 ? (locale === "zh" ? " 等" : " etc.") : "",
      }),
    });
    signals.push({
      key: "camera_fields",
      label: t("evidence.camera_fields_complete"),
      detail: t("evidence.camera_fields_complete_detail", {
        count: presentFields.length,
        fields: presentFields.slice(0, 5).join(", "),
        suffix: presentFields.length > 5 ? (locale === "zh" ? " 等" : " etc.") : "",
      }),
      lean: "real",
      weight: -0.3,
    });
  } else if (presentFields.length > 0) {
    realStrength += 0.15;
    evidence.push({
      type: "neutral",
      label: t("evidence.camera_fields_few"),
      detail: t("evidence.camera_fields_few_detail", { count: presentFields.length }),
    });
    signals.push({
      key: "camera_fields_few",
      label: t("evidence.camera_fields_few"),
      detail: t("evidence.camera_fields_few_detail", { count: presentFields.length }),
      lean: "neutral",
      weight: -0.1,
    });
  } else {
    // Has metadata but no camera fields (e.g. only ICC profile) — weak neutral.
    evidence.push({
      type: "neutral",
      label: t("evidence.no_camera_info"),
      detail: t("evidence.no_camera_info_detail"),
    });
  }

  // GPS
  if (meta.GPSLatitude || meta.GPSLongitude) {
    realStrength += 0.2;
    evidence.push({
      type: "real",
      label: t("evidence.gps_found"),
      detail: t("evidence.gps_found_detail", {
        lat: (meta.GPSLatitude as number)?.toFixed(4) ?? "N/A",
        lng: (meta.GPSLongitude as number)?.toFixed(4) ?? "N/A",
      }),
    });
    signals.push({
      key: "gps",
      label: t("evidence.gps_found"),
      detail: t("evidence.gps_found_detail", {
        lat: (meta.GPSLatitude as number)?.toFixed(4) ?? "N/A",
        lng: (meta.GPSLongitude as number)?.toFixed(4) ?? "N/A",
      }),
      lean: "real",
      weight: -0.15,
    });
  }

  // DateTimeOriginal
  if (meta.DateTimeOriginal) {
    realStrength += 0.15;
    const dateStr = new Date(meta.DateTimeOriginal as string).toLocaleString(
      locale === "zh" ? "zh-CN" : "en-US"
    );
    evidence.push({
      type: "real",
      label: t("evidence.datetime_found"),
      detail: t("evidence.datetime_found_detail", { date: dateStr }),
    });
    signals.push({
      key: "datetime",
      label: t("evidence.datetime_found"),
      detail: t("evidence.datetime_found_detail", { date: dateStr }),
      lean: "real",
      weight: -0.1,
    });
  }

  // Software field
  const software = (meta.Software as string) || "";
  if (software) {
    const lowerSoftware = software.toLowerCase();
    const matchedAI = AI_SOFTWARE_SIGNATURES.find((sig) => lowerSoftware.includes(sig));
    if (matchedAI) {
      aiStrength += 0.5;
      evidence.push({
        type: "ai",
        label: t("evidence.ai_software"),
        detail: t("evidence.ai_software_detail", { software }),
      });
      signals.push({
        key: "ai_software",
        label: t("evidence.ai_software"),
        detail: t("evidence.ai_software_detail", { software }),
        lean: "ai",
        weight: 0.5,
      });
    } else {
      evidence.push({
        type: "neutral",
        label: t("evidence.software_info"),
        detail: t("evidence.software_info_detail", { software }),
      });
      signals.push({
        key: "software",
        label: t("evidence.software_info"),
        detail: t("evidence.software_info_detail", { software }),
        lean: "neutral",
        weight: -0.05,
      });
    }
  }

  // Faint format heuristic: PNG/WebP with no camera fields is often a
  // screenshot / app export / digital drawing — typically REAL content.
  if ((format === "png" || format === "webp") && presentFields.length < 3) {
    realStrength += 0.1;
    signals.push({
      key: "format",
      label: t("evidence.format_digital"),
      detail: t("evidence.format_digital_detail", { format: format.toUpperCase() }),
      lean: "real",
      weight: -0.1,
    });
  }

  realStrength = clamp(realStrength, 0, 1);
  aiStrength = clamp(aiStrength, 0, 1);

  // Moderator score: centered at 0.5, nudged by net signal.
  const score = clamp(0.5 + (aiStrength - realStrength) * 0.3, 0.05, 0.95);

  let category: SignalLean = "neutral";
  if (aiStrength > 0.3 && aiStrength >= realStrength) category = "ai";
  else if (realStrength > 0.3) category = "real";

  return {
    score,
    hasExif: presentFields.length > 0,
    fieldCount: Object.keys(meta).length,
    category,
    realStrength,
    aiStrength,
    format,
    evidence,
    signals,
  };
}

function buildNeutral(
  format: ImageFormat,
  t: (key: string, params?: Record<string, string | number>) => string,
  labelKey: string,
  detailKey: string
): ExifResult {
  return {
    score: 0.5,
    hasExif: false,
    fieldCount: 0,
    category: "neutral",
    realStrength: 0,
    aiStrength: 0,
    format,
    evidence: [
      {
        type: "neutral",
        label: t(labelKey),
        detail: t(detailKey),
      },
    ],
    signals: [
      {
        key: "no_exif",
        label: t(labelKey),
        detail: t(detailKey),
        lean: "neutral",
        weight: 0,
      },
      {
        key: "format",
        label: t("evidence.format_digital"),
        detail: t("evidence.format_digital_detail", { format: format.toUpperCase() }),
        lean: "neutral",
        weight: 0,
      },
    ],
  };
}
