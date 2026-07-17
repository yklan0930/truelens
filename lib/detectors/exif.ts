/**
 * EXIF Metadata Analyzer
 * Analyzes image metadata to detect AI-generated images.
 * Real photos typically have rich EXIF data (camera model, GPS, timestamps).
 * AI-generated images usually have no EXIF or contradictory metadata.
 */

import exifr from "exifr";

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
  imageBuffer: Buffer
): Promise<ExifResult> {
  let exifData: Record<string, unknown> | null = null;

  try {
    exifData = await exifr.parse(imageBuffer, {
      iptc: true,
      ifd0: true,
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
          label: "无 EXIF 数据",
          detail: "图片完全不含元数据，AI 生成图片通常如此",
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
          label: "无 EXIF 数据",
          detail: "图片完全不含元数据，真实相机拍摄的照片通常会有相机信息",
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
      label: "相机元数据完整",
      detail: `检测到 ${presentFields.length} 个相机相关字段：${presentFields
        .slice(0, 5)
        .join(", ")}${presentFields.length > 5 ? " 等" : ""}`,
    });
  } else if (presentFields.length > 0) {
    realScore += 0.15;
    evidence.push({
      type: "neutral",
      label: "元数据较少",
      detail: `仅检测到 ${presentFields.length} 个相机字段，可能是压缩后的真实照片`,
    });
  } else {
    aiScore += 0.3;
    evidence.push({
      type: "ai",
      label: "缺少相机信息",
      detail: "未检测到任何相机品牌、型号、光圈等元数据",
    });
  }

  // Check GPS data
  if (exifData.GPSLatitude || exifData.GPSLongitude) {
    realScore += 0.2;
    evidence.push({
      type: "real",
      label: "包含 GPS 定位",
      detail: `经纬度：${exifData.GPSLatitude?.toFixed(4)}, ${exifData.GPSLongitude?.toFixed(4)}`,
    });
  }

  // Check DateTimeOriginal
  if (exifData.DateTimeOriginal) {
    realScore += 0.15;
    evidence.push({
      type: "real",
      label: "包含拍摄时间",
      detail: `拍摄时间：${new Date(exifData.DateTimeOriginal as string).toLocaleString("zh-CN")}`,
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
        label: "检测到 AI 软件签名",
        detail: `Software 字段包含：${software}`,
      });
    } else {
      evidence.push({
        type: "neutral",
        label: "包含软件信息",
        detail: `Software：${software}`,
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
