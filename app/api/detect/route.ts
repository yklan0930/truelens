import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/analyzer";

export const runtime = "nodejs";
export const maxDuration = 30; // 30 seconds max

// --- Simple in-memory rate limiter ---
// Limits: 10 requests/minute per IP (prevents abuse)
// Note: In production on Vercel, this resets per serverless instance.
// For more robust limiting, use Upstash Redis or Vercel KV.

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }

  entry.count++;
  const remaining = RATE_LIMIT_MAX - entry.count;
  return {
    allowed: entry.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, remaining),
    resetAt: entry.resetAt,
  };
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

// Allowed MIME types
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    // --- Rate limiting ---
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetAt),
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    // --- Parse form data ---
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "请上传图片文件" },
        { status: 400 }
      );
    }

    // --- Validate file type (strict whitelist) ---
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `不支持的文件类型：${file.type}。仅支持 JPG、PNG、WebP` },
        { status: 400 }
      );
    }

    // --- Validate file size ---
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "图片大小不能超过 10MB" },
        { status: 400 }
      );
    }

    if (file.size < 100) {
      return NextResponse.json(
        { error: "图片文件过小，可能已损坏" },
        { status: 400 }
      );
    }

    // --- Check HF token ---
    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      return NextResponse.json(
        { error: "服务器未配置检测引擎" },
        { status: 500 }
      );
    }

    // --- Convert File to Buffer (in memory, not persisted) ---
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // --- Run analysis ---
    const result = await analyzeImage(imageBuffer, hfToken);

    // Return result with rate limit headers
    const response = NextResponse.json({
      success: true,
      result: {
        aiProbability: result.aiProbability,
        verdict: result.verdict,
        confidence: result.confidence,
        evidence: result.evidence,
        processingTimeMs: result.processingTimeMs,
        fileName: file.name,
        fileSize: file.size,
      },
    });

    response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
    response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "检测过程中发生未知错误";
    console.error("[TrueLens] Detection error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", service: "TrueLens API" });
}
