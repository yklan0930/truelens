// Sightengine AI Video Detection integration (PRIMARY engine path).
//
// Architecture note: the video file is uploaded by the BROWSER directly to
// blob storage (never through Vercel functions — 4.5 MB body limit). We then
// hand Sightengine the resulting *public URL*; Sightengine fetches it, analyzes
// asynchronously, and POSTs the result to our /webhook route. This keeps Vercel
// functions touching only small JSON.
//
// NOTE: The exact `genai-video` response shape should be validated against a
// real call during Phase 0. The normalizer below is defensive so it won't
// crash on unexpected fields.

import { createHmac } from "crypto";
import {
  type VideoResult,
  type VideoEvidenceItem,
  verdictFromProbability,
  confidenceFromProbability,
} from "./types";

const API_BASE = "https://api.sightengine.com/video";

export function isSightengineConfigured(): boolean {
  return !!process.env.SIGHTENGINE_API_USER && !!process.env.SIGHTENGINE_API_SECRET;
}

interface SubmitArgs {
  mediaUrl: string;
  callbackUrl: string;
  fileName?: string;
}

// Kick off an async video check. Returns Sightengine's job_id.
export async function submitSightengineVideo({
  mediaUrl,
  callbackUrl,
  fileName,
}: SubmitArgs): Promise<{ jobId: string }> {
  const user = process.env.SIGHTENGINE_API_USER!;
  const secret = process.env.SIGHTENGINE_API_SECRET!;

  const params = new URLSearchParams({
    api_user: user,
    api_secret: secret,
    media_url: mediaUrl,
    models: "genai-video",
    callback_url: callbackUrl,
    // Ask Sightengine to sign the callback body with our secret.
    callback_with_signature: "true",
  });

  const res = await fetch(`${API_BASE}/check.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== "success") {
    const msg = (data as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
    throw new Error(`Sightengine submit failed: ${msg}`);
  }
  return { jobId: String(data.job_id ?? "") };
}

// Normalize a raw Sightengine `genai-video` callback payload into VideoResult.
export function normalizeSightengineResult(raw: unknown, meta?: { fileName?: string; fileSize?: number }): VideoResult {
  const r = (raw ?? {}) as Record<string, any>;
  // genai-video reports a single "type.prob" in [0,1] for AI likelihood.
  const probRaw =
    r?.type?.prob ?? r?.summary?.avg_prob ?? r?.prob ?? 0.5;
  const prob = Math.max(0, Math.min(1, Number(probRaw) || 0.5));
  const aiProbability = Math.round(prob * 100);
  const verdict = verdictFromProbability(aiProbability);
  const confidence = confidenceFromProbability(aiProbability);

  const frames = Number(r?.frames?.count ?? r?.frames ?? 0) || undefined;
  const faces = Array.isArray(r?.faces) ? r.faces.length : undefined;
  const durationSec = Number(r?.duration) || undefined;

  const evidence: VideoEvidenceItem[] = [
    {
      source: "genai-video",
      type: prob >= 0.7 ? "ai" : prob <= 0.3 ? "real" : "neutral",
      label:
        prob >= 0.7
          ? "AI 生成视频特征明显"
          : prob <= 0.3
            ? "未见明显 AI 生成痕迹"
            : "存在混合信号，建议人工复核",
      detail: `模型整体 AI 概率 ${(prob * 100).toFixed(1)}%`,
    },
  ];
  if (frames) {
    evidence.push({
      source: "frames",
      type: "neutral",
      label: `共分析 ${frames} 帧`,
      detail: `采样帧数 ${frames}${durationSec ? `，时长约 ${durationSec}s` : ""}`,
    });
  }
  if (faces !== undefined) {
    evidence.push({
      source: "faces",
      type: "neutral",
      label: `检测到 ${faces} 张人脸`,
      detail: faces > 0 ? "已对人脸区域进行一致性分析" : "未检测到人脸",
    });
  }

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
    engine: "sightengine",
    processingTimeMs: 0,
    fileName: meta?.fileName,
    fileSize: meta?.fileSize,
    durationSec,
    framesAnalyzed: frames,
  };
}

// Verify the `X-Sightengine-Signature` header (HMAC-SHA256 of the raw body
// using our api_secret). Header format: "sha256=<hex>".
export function verifySightengineSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.SIGHTENGINE_API_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!provided) return false;
  // Timing-safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
