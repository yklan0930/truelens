/**
 * Hugging Face ViT Image Detector (multi-model capable).
 *
 * Primary: Ateeqq/ai-vs-human-image-detector (binary ai/hum)
 * Secondary: dima806/deepfake-image-detector (binary Real/Fake)
 *
 * Both share the same router.huggingface.co endpoint and free-tier auth model.
 * Uses the HF_TOKEN env var.
 *
 * Returns the SAME HFDetectionResult shape regardless of which model produced
 * it — the response normalizer below maps different label vocabularies onto
 * the unified { aiScore, humanScore, confidence } shape.
 */

import { serverT, type ServerLocale } from "@/lib/i18n/server";

const HF_BASE =
  "https://router.huggingface.co/hf-inference/models";

const HF_MODELS = {
  ateeqq: `${HF_BASE}/Ateeqq/ai-vs-human-image-detector`,
  dima806: `${HF_BASE}/dima806/deepfake-image-detector`,
} as const;

export type HFModelId = keyof typeof HF_MODELS;

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
  modelId: HFModelId; // which model produced this result
}

/**
 * Call a Hugging Face image classification model. Accepts any model id under
 * HF_MODELS (or a fully qualified URL via `customUrl`). Returns a normalized
 * HFDetectionResult regardless of the underlying model's label vocabulary.
 */
export async function detectWithHuggingFace(
  imageBuffer: Buffer,
  token: string,
  locale: ServerLocale = "zh",
  modelId: HFModelId = "ateeqq"
): Promise<HFDetectionResult> {
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  const url = HF_MODELS[modelId];

  ensureProxy();

  let lastError: Error | null = null;

  // Retry up to 3 times (model may be loading on first call)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
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
      const parsed = normalizeHFResponse(data);
      return { ...parsed, modelId };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error(t("api.hfCallFailed"));
}

/**
 * Normalize any HF image-classification response into { aiScore, humanScore,
 * confidence }. We accept both:
 *   Ateeqq:   [{ label: "ai", score: 0.99 }, { label: "hum", score: 0.01 }]
 *   Dima806:  [{ label: "Real", score: 0.95 }, { label: "Fake", score: 0.05 }]
 * and any other pair by checking each label against the AI / Real vocabularies.
 */
function normalizeHFResponse(data: unknown): Omit<HFDetectionResult, "modelId"> {
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error("hf.formatError");
  }
  const aiTokens = ["ai", "artificial", "fake", "synthetic", "generated"];
  const realTokens = ["hum", "human", "real", "authentic", "natural"];

  let aiScore = 0.5;
  let humanScore = 0.5;
  let matched = false;

  for (const item of data as Array<{ label?: string; score?: number }>) {
    if (typeof item?.label !== "string" || typeof item?.score !== "number") continue;
    const l = item.label.toLowerCase();
    if (aiTokens.some((t) => l.includes(t))) {
      aiScore = item.score;
      matched = true;
    } else if (realTokens.some((t) => l.includes(t))) {
      humanScore = item.score;
      matched = true;
    }
  }

  if (!matched) {
    throw new Error("hf.unknownLabels");
  }

  return {
    aiScore,
    humanScore,
    confidence: Math.max(aiScore, humanScore),
  };
}
