/**
 * EXIF Metadata Analyzer
 * Analyzes image metadata to detect AI-generated images.
 * Real photos typically have rich EXIF data (camera model, GPS, timestamps).
 * AI-generated images usually have no EXIF or contradictory metadata.
 */

import exifr from "exifr";
import { serverT, type ServerLocale } from "@/lib/i18n/server";

export interface ExifResult {
  score: number; // 0-1, higher = more likely AI-generated
  hasExif: boolean;
  fieldCount: number;
  evidence: ExifEvidence[];
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

export async function analyzeExif(
  imageBuffer: Buffer,
  locale: ServerLocale = "zh"
): Promise<ExifResult> {
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  let exifData: Record<string, unknown> | null = null;

  try {
    exifData = await exifr.parse(imageBuffer, {
      iptc: true,
      ifd0: {},
      exif: true,
      gps: true,
    });
  } catch {
    // If EXIF parsing fails entirely, that's suspicious
    return {
      score: 0.7,
      hasExif: false,
      fieldCount: 0,
      evidence: [
        {
          type: "ai",
          label: t("evidence.no_exif"),
          detail: t("evidence.no_exif_detail_ai"),
        },
      ],
    };
  }

  if (!exifData || Object.keys(exifData).length === 0) {
    return {
      score: 0.7,
      hasExif: false,
      fieldCount: 0,
      evidence: [
        {
          type: "ai",
          label: t("evidence.no_exif"),
          detail: t("evidence.no_exif_detail_real"),
        },
      ],
    };
  }

  const evidence: ExifEvidence[] = [];
  let realScore = 0;
  let aiScore = 0;

  // Count real camera fields present
  const presentFields = REAL_CAMERA_FIELDS.filter(
    (field) =>
      exifData[field] !== undefined && exifData[field] !== null
  );

  if (presentFields.length >= 3) {
    realScore += 0.4;
    evidence.push({
      type: "real",
      label: t("evidence.camera_fields_complete"),
      detail: t("evidence.camera_fields_complete_detail", {
        count: presentFields.length,
        fields: presentFields.slice(0, 5).join(", "),
        suffix: presentFields.length > 5 ? (locale === "zh" ? " 等" : " etc.") : "",
      }),
    });
  } else if (presentFields.length > 0) {
    realScore += 0.15;
    evidence.push({
      type: "neutral",
      label: t("evidence.camera_fields_few"),
      detail: t("evidence.camera_fields_few_detail", {
        count: presentFields.length,
      }),
    });
  } else {
    aiScore += 0.3;
    evidence.push({
      type: "ai",
      label: t("evidence.no_camera_info"),
      detail: t("evidence.no_camera_info_detail"),
    });
  }

  // Check GPS data
  if (exifData.GPSLatitude || exifData.GPSLongitude) {
    realScore += 0.2;
    evidence.push({
      type: "real",
      label: t("evidence.gps_found"),
      detail: t("evidence.gps_found_detail", {
        lat: (exifData.GPSLatitude as number)?.toFixed(4) ?? "N/A",
        lng: (exifData.GPSLongitude as number)?.toFixed(4) ?? "N/A",
      }),
    });
  }

  // Check DateTimeOriginal
  if (exifData.DateTimeOriginal) {
    realScore += 0.15;
    const dateStr = new Date(exifData.DateTimeOriginal as string).toLocaleString(
      locale === "zh" ? "zh-CN" : "en-US"
    );
    evidence.push({
      type: "real",
      label: t("evidence.datetime_found"),
      detail: t("evidence.datetime_found_detail", { date: dateStr }),
    });
  }

  // Check Software field for AI signatures
  const software = (exifData.Software as string) || "";
  if (software) {
    const lowerSoftware = software.toLowerCase();
    const matchedAI = AI_SOFTWARE_SIGNATURES.find((sig) =>
      lowerSoftware.includes(sig)
    );
    if (matchedAI) {
      aiScore += 0.5;
      evidence.push({
        type: "ai",
        label: t("evidence.ai_software"),
        detail: t("evidence.ai_software_detail", { software }),
      });
    } else {
      evidence.push({
        type: "neutral",
        label: t("evidence.software_info"),
        detail: t("evidence.software_info_detail", { software }),
      });
    }
  }

  // Calculate final score (0 = likely real, 1 = likely AI)
  const score = Math.min(0.95, Math.max(0.05, 0.5 + aiScore - realScore));

  return {
    score,
    hasExif: presentFields.length > 0,
    fieldCount: Object.keys(exifData).length,
    evidence,
  };
}
