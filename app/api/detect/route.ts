import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/analyzer";
import { serverT, detectLocale, type ServerLocale } from "@/lib/i18n/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30; // 30 seconds max

// --- Limits ---
const ANON_DAILY_LIMIT = 1; // anonymous users
const USER_DAILY_LIMIT = 5; // logged-in free users
const PAID_DAILY_LIMIT = 50; // pro members

// Parse a comma-separated env var of emails (case-insensitive).
function parseEmails(env?: string): string[] {
  return (env || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// --- Simple in-memory rate limiter ---
// Limits: 10 requests/minute per IP (prevents abuse)
// Note: In production on Vercel, this resets per serverless instance.

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

function isDatabaseConfigured() {
  return !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost:5432/truelens");
}

function getTodayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function POST(request: NextRequest) {
  // Detect locale from request
  const locale: ServerLocale = detectLocale(request.headers.get("accept-language"));
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  // --- Safety: reject obviously oversized requests before parsing ---
  // Vercel edge / some proxies return raw HTML/text for oversized bodies,
  // which crashes the client's res.json(). Catch it early with a proper JSON
  // error response. The real limit (4.5 MB on Vercel free tier) is enforced
  // by the platform; this is just a friendlier error message.
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 4.5 * 1024 * 1024) {
    return NextResponse.json(
      { error: t("errors.fileTooLarge") },
      { status: 413 }
    );
  }

  try {
    // --- Rate limiting ---
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: t("api.rateLimit") },
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
        { error: t("api.noFile") },
        { status: 400 }
      );
    }

    // --- Validate file type (strict whitelist) ---
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: t("api.unsupportedType", { type: file.type }) },
        { status: 400 }
      );
    }

    // --- Validate file size ---
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: t("api.fileTooLarge") },
        { status: 400 }
      );
    }

    if (file.size < 100) {
      return NextResponse.json(
        { error: t("api.fileTooSmall") },
        { status: 400 }
      );
    }

    // --- Check HF token ---
    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      return NextResponse.json(
        { error: t("api.noEngine") },
        { status: 500 }
      );
    }

    // --- Check auth + usage + entitlement (if database is configured) ---
    let userId: string | null = null;
    let userDailyCount = 0;
    let dailyLimit = ANON_DAILY_LIMIT;
    let isAdmin = false;
    let plan = "free";
    let unlimited = false;
    let showDetailed = false;

    if (isDatabaseConfigured()) {
      try {
        const { prisma } = await import("@/lib/prisma");
        const session = await auth();
        if (session?.user?.id) {
          userId = session.user.id;
          dailyLimit = USER_DAILY_LIMIT;
          isAdmin = !!session.user.isAdmin;
          plan = session.user.plan || "free";

          // Env overrides (set in Vercel) — handy before DB role migration.
          const adminEmails = parseEmails(process.env.ADMIN_EMAILS);
          const paidEmails = parseEmails(process.env.PAID_EMAILS);
          const email = (session.user.email || "").toLowerCase();
          if (email && adminEmails.includes(email)) isAdmin = true;
          if (email && paidEmails.includes(email) && plan === "free") plan = "pro";

          // Refresh role/plan from DB (authoritative).
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: userId },
              select: { isAdmin: true, plan: true },
            });
            if (dbUser) {
              if (dbUser.isAdmin) isAdmin = true;
              if (dbUser.plan && dbUser.plan !== "free") plan = dbUser.plan;
            }
          } catch {
            // keep env/token values
          }

          unlimited = isAdmin || plan === "business";
          showDetailed = isAdmin || plan !== "free";
          if (plan === "pro") dailyLimit = PAID_DAILY_LIMIT;
          if (unlimited) dailyLimit = Infinity;

          // Enforce quota unless unlimited.
          if (dailyLimit !== Infinity) {
            const today = getTodayDate();
            const usage = await prisma.usageRecord.findUnique({
              where: { userId_date: { userId, date: today } },
            });
            userDailyCount = usage?.count || 0;

            if (userDailyCount >= dailyLimit) {
              return NextResponse.json(
                { error: t("errors.quotaExhausted") },
                { status: 429 }
              );
            }
          }
        }
      } catch (dbError) {
        // Database error — gracefully degrade to anonymous mode
        console.error("[TrueLens] DB error during auth check:", dbError);
      }
    }

    // --- Convert File to Buffer (in memory, not persisted) ---
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // --- Run analysis with locale and original filename ---
    const result = await analyzeImage(imageBuffer, hfToken, file.name, locale);

    // --- Entitlement: hide the professional report from trial users ---
    // Free/anonymous users only receive the verdict + probability. The detailed
    // evidence breakdown (our "judgment logic") is reserved for paid members
    // and admins. Stripping server-side means trial users cannot retrieve it
    // even via devtools.
    if (!showDetailed) {
      result.evidence = [];
      result.signals = undefined;
      result.calibration = undefined;
    }

    // --- Track usage for authenticated users ---
    if (userId && isDatabaseConfigured()) {
      try {
        const { prisma } = await import("@/lib/prisma");
        const today = getTodayDate();

        // Increment usage count
        await prisma.usageRecord.upsert({
          where: {
            userId_date: { userId, date: today },
          },
          create: {
            userId,
            date: today,
            count: 1,
          },
          update: {
            count: { increment: 1 },
          },
        });

        // Save detection history
        await prisma.detectionHistory.create({
          data: {
            userId,
            imageName: file.name,
            aiProbability: result.aiProbability,
            isAI: result.verdict === "likely_ai",
            confidence: result.confidence,
            processingTimeMs: result.processingTimeMs,
            evidence: JSON.parse(JSON.stringify(result.evidence)),
            locale,
          },
        });
      } catch (dbError) {
        // Non-fatal: detection succeeded, just couldn't track
        console.error("[TrueLens] DB error during usage tracking:", dbError);
      }
    }

    // Return result with rate limit headers
    const response = NextResponse.json({
      success: true,
      showDetailed,
      result: {
        aiProbability: result.aiProbability,
        verdict: result.verdict,
        confidence: result.confidence,
        evidence: result.evidence,
        signals: result.signals,
        screenRephoto: result.screenRephoto,
        processingTimeMs: result.processingTimeMs,
        fileName: file.name,
        fileSize: file.size,
      },
      // Include auth context for client
      auth: userId
        ? {
            authenticated: true,
            unlimited,
            isAdmin,
            plan,
            showDetailed,
            dailyLimit: dailyLimit === Infinity ? -1 : dailyLimit,
            dailyUsed: userDailyCount + 1,
            dailyRemaining:
              dailyLimit === Infinity
                ? -1
                : Math.max(0, dailyLimit - userDailyCount - 1),
          }
        : {
            authenticated: false,
            unlimited: false,
            isAdmin: false,
            plan: "free",
            showDetailed: false,
            dailyLimit: ANON_DAILY_LIMIT,
          },
    });

    response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
    response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t("api.unknownError");
    console.error("[TrueLens] Detection error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "TrueLens API",
    dbConfigured: isDatabaseConfigured(),
  });
}
