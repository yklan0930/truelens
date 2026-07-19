// Sightengine AI Image Detection — synchronous image endpoint.
//
// Reuses the SAME Sightengine account/credentials as the video detector
// (lib/video/sightengine.ts): SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET.
// The `genai` model applies to BOTH image and video on one plan, so enabling
// image detection requires no extra subscription — just these env vars.
//
// API docs: https://sightengine.com/docs/ai-generated-image-detection
//   Endpoint: https://api.sightengine.com/1.0/check.json   (sync)
//   Model:    genai
//   Upload:   multipart `media` field (we upload the bytes directly; no
//             intermediate blob storage needed, unlike the async video flow)
//   Response: { status:"success", type:{ ai_generated: 0.98 }, ... }
//
// Why this is the upgrade path: the free HF model (Ateeqq) is near-binary and
// confidently misclassifies ~half of real photos. Sightengine's `genai` is a
// trained commercial detector that (a) actually catches AI generations and
// (b) does NOT falsely accuse real photographs — so it lets us satisfy BOTH
// "catch the AI" and "don't wrongfully accuse a real person".

import { serverT, type ServerLocale } from "@/lib/i18n/server";
import Jimp from "jimp";

const API_BASE = "https://api.sightengine.com/1.0";

// Sightengine's image endpoint caps the uploaded `media` size. Paid plans lift
// it, but to be safe (and to cut bandwidth/cost) we downscale any image above
// this to a 1024px-longest-side JPEG before upload. genai detection is
// unaffected by modest resizing.
const MAX_UPLOAD_BYTES = 1_000_000;
const MAX_SIDE = 1024;

/** Downscale oversized images to fit Sightengine's upload limit. */
async function prepareUpload(
  buffer: Buffer,
  filename?: string
): Promise<{ data: Buffer; contentType: string; name: string }> {
  let buf = buffer;
  let contentType = filename?.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  let name = filename || "image.jpg";

  if (buffer.length > MAX_UPLOAD_BYTES) {
    try {
      const img = await Jimp.read(buffer);
      img.scaleToFit(MAX_SIDE, MAX_SIDE);
      buf = await img.getBufferAsync(Jimp.MIME_JPEG);
      contentType = "image/jpeg";
      name = (filename ? filename.replace(/\.[^.]+$/, "") : "image") + ".jpg";
    } catch {
      // Resize failed — fall through and try the original; Sightengine will
      // return its own size error if it truly exceeds the limit.
    }
  }
  return { data: buf, contentType, name };
}

// Configure a proxy agent for local dev behind a corporate/China proxy.
// Production (Vercel) needs no proxy; this is a no-op when unset.
let proxyConfigured = false;
function ensureProxy() {
  if (proxyConfigured) return;
  const proxyUrl =
    process.env.HTTPS_PROXY || process.env.HTTP_PROXY ||
    process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    try {
      const { ProxyAgent, setGlobalDispatcher } = require("undici");
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
    } catch {
      // undici should be present in the Next.js runtime; ignore if absent.
    }
  }
  proxyConfigured = true;
}

export interface SightengineImageResult {
  /** AI-generation probability in [0,1]. */
  aiScore: number;
  /** Raw provider payload, kept for transparency / debugging. */
  raw?: Record<string, any>;
  modelId: "sightengine";
}

export function isSightengineImageConfigured(): boolean {
  return !!process.env.SIGHTENGINE_API_USER && !!process.env.SIGHTENGINE_API_SECRET;
}

interface CallOpts {
  filename?: string;
  locale?: ServerLocale;
  signal?: AbortSignal;
}

/**
 * Run Sightengine's `genai` model on an image buffer.
 * Returns a normalized { aiScore } in [0,1]. Throws on API/network error.
 */
export async function detectAIWithSightengine(
  imageBuffer: Buffer,
  opts: CallOpts = {}
): Promise<SightengineImageResult> {
  const locale = opts.locale ?? "zh";
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  const user = process.env.SIGHTENGINE_API_USER!;
  const secret = process.env.SIGHTENGINE_API_SECRET!;

  ensureProxy();

  const form = new FormData();
  form.append("api_user", user);
  form.append("api_secret", secret);
  form.append("models", "genai");

  const { data, contentType, name } = await prepareUpload(imageBuffer, opts.filename);
  form.append("media", new Blob([data as unknown as BlobPart], { type: contentType }), name);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort());

  try {
    const res = await fetch(`${API_BASE}/check.json`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok || data.status !== "success") {
      const msg = data?.error?.message || JSON.stringify(data).slice(0, 160);
      throw new Error(t("api.sightengineError", { error: msg }));
    }

    // The `genai` model reports the AI probability under type.ai_generated.
    // Older/alt payloads sometimes nest it differently; read defensively.
    const typeObj = (data.type ?? {}) as Record<string, any>;
    const raw = Number(
      typeObj.ai_generated ??
        typeObj.ai_generated_prob ??
        typeObj.prob ??
        data.ai_generated ??
        data.ai_generated_prob
    );
    const aiScore = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.5;

    return { aiScore, raw: data, modelId: "sightengine" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(t("api.sightengineTimeout"));
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
