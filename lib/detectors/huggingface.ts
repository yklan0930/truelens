/**
 * Hugging Face ViT Image Detector
 * Model: Ateeqq/ai-vs-human-image-detector
 * Accuracy: 99.23% (verified 88.9% in our tests)
 *
 * Uses router.huggingface.co endpoint (api-inference has SSL issues).
 * Configures proxy agent from env vars for environments behind a proxy.
 */

import { serverT, type ServerLocale } from "@/lib/i18n/server";

// Use router endpoint — api-inference.huggingface.co has SSL issues in some environments
const HF_MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/Ateeqq/ai-vs-human-image-detector";

// Configure proxy if available (for dev environments behind a proxy)
// In production (Vercel), no proxy is needed
let proxyConfigured = false;
function ensureProxy() {
  if (proxyConfigured) return;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    try {
      // undici is built into Node.js 18+
      const { ProxyAgent, setGlobalDispatcher } = require("undici");
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
      console.log("[TrueLens] Proxy configured:", proxyUrl);
    } catch {
      console.warn("[TrueLens] Failed to configure proxy, trying direct connection");
    }
  }
  proxyConfigured = true;
}

export interface HFDetectionResult {
  aiScore: number; // 0-1, probability of being AI-generated
  humanScore: number; // 0-1, probability of being human/real
  confidence: number; // max(aiScore, humanScore)
}

export async function detectWithHuggingFace(
  imageBuffer: Buffer,
  token: string,
  locale: ServerLocale = "zh"
): Promise<HFDetectionResult> {
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  ensureProxy();

  let lastError: Error | null = null;

  // Retry up to 3 times (model may be loading on first call)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(HF_MODEL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
        },
        body: new Uint8Array(imageBuffer),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 503) {
          // Model loading, wait and retry
          lastError = new Error(t("api.modelLoading"));
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw new Error(t("api.hfApiError", { status: response.status, error: errorText }));
      }

      const data = await response.json();

      // Response format: [{ "label": "ai", "score": 0.9996 }, { "label": "hum", "score": 0.0004 }]
      if (!Array.isArray(data) || data.length < 2) {
        throw new Error(t("api.hfFormatError"));
      }

      const aiResult = data.find((r: { label: string }) => r.label === "ai");
      const humResult = data.find((r: { label: string }) => r.label === "hum");

      if (!aiResult || !humResult) {
        throw new Error(t("api.hfMissingFields"));
      }

      return {
        aiScore: aiResult.score,
        humanScore: humResult.score,
        confidence: Math.max(aiResult.score, humResult.score),
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error(t("api.hfCallFailed"));
}
