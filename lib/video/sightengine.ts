// Sightengine AI Video Detection integration (PRIMARY engine path).
//
// Architecture note: the video file is uploaded by the BROWSER directly to
// blob storage (never through Vercel functions — 4.5 MB body limit). We then
// hand Sightengine the resulting *public URL*; Sightengine fetches it, analyzes
// asynchronously, and POSTs the result to our /webhook route. This keeps Vercel
// functions touching only small JSON.
//
// API docs: https://sightengine.com/docs/ai-generated-video-detection
//  - Async submit:  https://api.sightengine.com/1.0/video/check.json
//  - Sync submit:   https://api.sightengine.com/1.0/video/check-sync.json
//  - Model:         genai
//  - Submit resp:   { status: "success", request: { id: "req_..." } }
//  - Callback body: { data: { frames: [{ type: { ai_generated: 0.99 } }] } }

import { createHmac } from "crypto";
import {
  type VideoResult,
  type VideoEvidenceItem,
  verdictFromProbability,
  confidenceFromProbability,
} from "./types";

const API_BASE = "https://api.sightengine.com/1.0/video";

export function isSightengineConfigured(): boolean {
  return !!process.env.SIGHTENGINE_API_USER && !!process.env.SIGHTENGINE_API_SECRET;
}

interface SubmitArgs {
  mediaUrl: string;
  callbackUrl: string;
  fileName?: string;
}

// Kick off an async video check. Returns Sightengine's request.id.
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
    models: "genai",
    callback_url: callbackUrl,
    // Ask Sightengine to sign the callback body with our secret.
    callback_with_signature: "true",
  });

  const res = await fetch(`${API_BASE}/check.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    request?: { id?: string };
    error?: { message?: string };
  };
  if (!res.ok || data.status !== "success") {
    const msg = data.error?.message || `HTTP ${res.status}`;
    throw new Error(`Sightengine submit failed: ${msg}`);
  }
  const jobId = data.request?.id;
  if (!jobId) {
    throw new Error("Sightengine submit failed: missing request.id in response");
  }
  return { jobId: String(jobId) };
}

// Normalize a raw Sightengine callback payload into VideoResult.
//
// Actual callback shape (after signature verification):
//   {
//     "request": { "id": "req_..." },
//     "data": {
//       "frames": [
//         { "info": { "id": "...", "position": 0 }, "type": { "ai_generated": 0.99 } },
//         ...
//       ],
//       "video_info": { "duration": 12.3 }
//     }
//   }
//
// We average the per-frame `ai_generated` scores to get a single probability.
export function normalizeSightengineResult(
  raw: unknown,
  meta?: { fileName?: string; fileSize?: number }
): VideoResult {
  const r = (raw ?? {}) as Record<string, any>;
  const data = (r.data ?? {}) as Record<string, any>;
  const frames: any[] = Array.isArray(data.frames) ? data.frames : [];

  // Per-frame scores (0..1). Fall back to data.type.ai_generated for sync responses.
  const perFrame = frames
    .map((f) => Number(f?.type?.ai_generated))
    .filter((n) => Number.isFinite(n));
  let prob: number;
  if (perFrame.length > 0) {
    prob = perFrame.reduce((a, b) => a + b, 0) / perFrame.length;
  } else {
    const fallback = Number(data?.type?.ai_generated ?? r?.type?.ai_generated ?? 0.5);
    prob = Number.isFinite(fallback) ? fallback : 0.5;
  }
  prob = Math.max(0, Math.min(1, prob));

  // Clamp to [1, 99] so no result reads as a disputable "100% / 0%".
  const aiProbability = Math.min(99, Math.max(1, Math.round(prob * 100)));
  const verdict = verdictFromProbability(aiProbability);
  const confidence = confidenceFromProbability(aiProbability);

  const framesAnalyzed = perFrame.length || undefined;
  const faces = Array.isArray(r?.faces) ? r.faces.length : undefined;
  const durationSec = Number(data?.video_info?.duration ?? r?.duration) || undefined;

  const evidence: VideoEvidenceItem[] = [
    {
      source: "genai",
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
  if (framesAnalyzed) {
    evidence.push({
      source: "frames",
      type: "neutral",
      label: `共分析 ${framesAnalyzed} 帧`,
      detail: `采样帧数 ${framesAnalyzed}${durationSec ? `，时长约 ${durationSec.toFixed(1)}s` : ""}`,
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
    framesAnalyzed,
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
