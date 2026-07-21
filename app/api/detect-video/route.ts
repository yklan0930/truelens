import { NextRequest, NextResponse } from "next/server";
import { detectLocale, serverT, type ServerLocale } from "@/lib/i18n/server";
import { auth } from "@/lib/auth";
import { resolveVideoEngine } from "@/lib/video/engine";
import { submitSightengineVideo } from "@/lib/video/sightengine";
import {
  incrementVideoUsage,
} from "@/lib/video/quota";
import {
  monthlyLimitFor,
  ANON_MONTHLY_CREDITS,
  VIDEO_COST,
  firstOfMonth,
  hasCredits,
  type Plan,
} from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 30;

function parseEmails(env?: string): string[] {
  return (env || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isDatabaseConfigured() {
  return !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost:5432/truelens");
}

// --- Simple in-memory rate limiter (mirrors image route) ---
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;
interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitMap = new Map<string, RateLimitEntry>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of rateLimitMap.entries()) if (e.resetAt < now) rateLimitMap.delete(ip);
}, 5 * 60 * 1000);
function checkRateLimit(ip: string) {
  const now = Date.now();
  const e = rateLimitMap.get(ip);
  if (!e || e.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  e.count++;
  return { allowed: e.count <= RATE_LIMIT_MAX, remaining: Math.max(0, RATE_LIMIT_MAX - e.count) };
}
function getClientIP(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB hard cap (Sightengine Pro limit)

// POST /api/detect-video  body: { blobUrl?, engine?, fileName?, fileSize? }
export async function POST(request: NextRequest) {
  // Detect locale: prefer explicit frontend locale param, fallback to Accept-Language
  const urlLocale = request.nextUrl.searchParams.get("locale");
  const rawLocale = (urlLocale === "en" || urlLocale === "zh")
    ? urlLocale
    : detectLocale(request.headers.get("accept-language"));
  const locale: ServerLocale = rawLocale;
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  const clientIP = getClientIP(request);
  const rl = checkRateLimit(clientIP);
  if (!rl.allowed) {
    return NextResponse.json({ error: t("api.rateLimit") }, { status: 429 });
  }

  let body: { blobUrl?: string; engine?: string; fileName?: string; fileSize?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("api.invalidJson") }, { status: 400 });
  }

  const blobUrl = body.blobUrl || null;
  const fileName = body.fileName || "video";
  const fileSize = Number(body.fileSize) || 0;

  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: t("video.fileTooLarge") }, { status: 413 });
  }

  // --- Resolve auth + monthly credit quota (mirrors image detect route) ---
  let userId: string | null = null;
  let isAdmin = false;
  let plan: Plan = "free";
  let unlimited = false;
  let showDetailed = false;
  let monthlyLimit = ANON_MONTHLY_CREDITS;
  let monthlyUsed = 0;
  let monthlyRemaining = ANON_MONTHLY_CREDITS;

  if (isDatabaseConfigured()) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const session = await auth();
      if (session?.user?.id) {
        userId = session.user.id;
        isAdmin = !!session.user.isAdmin;
        plan = (session.user.plan as Plan) || "free";
        const adminEmails = parseEmails(process.env.ADMIN_EMAILS);
        const paidEmails = parseEmails(process.env.PAID_EMAILS);
        const email = (session.user.email || "").toLowerCase();
        if (email && adminEmails.includes(email)) isAdmin = true;
        if (email && paidEmails.includes(email) && plan === "free") plan = "pro";
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true, plan: true },
          });
          if (dbUser) {
            if (dbUser.isAdmin) isAdmin = true;
            if (dbUser.plan && dbUser.plan !== "free") plan = dbUser.plan as Plan;
          }
        } catch { /* keep */ }

        unlimited = isAdmin || plan === "business";
        showDetailed = isAdmin || plan !== "free";
        monthlyLimit = monthlyLimitFor(plan, isAdmin, unlimited);
        const usage = await prisma.videoUsageRecord.findUnique({
          where: { userId_date: { userId, date: firstOfMonth() } },
        });
        monthlyUsed = usage?.count ?? 0;
        if (!hasCredits(monthlyUsed, monthlyLimit, VIDEO_COST)) {
          return NextResponse.json({ error: t("errors.quotaExhausted") }, { status: 429 });
        }
        monthlyRemaining =
          monthlyLimit === Infinity ? -1 : Math.max(0, monthlyLimit - monthlyUsed);
      } else {
        // Anonymous cannot run videos (cost 8 > anon grant of 3).
        return NextResponse.json({ error: t("errors.quotaExhausted") }, { status: 429 });
      }
    } catch (dbError) {
      console.error("[TrueLens Video] DB error during auth:", dbError);
    }
  }

  // Resolve engine NOW that we know the user's plan.
  const engine = resolveVideoEngine({
    isAuthenticated: !!userId,
    isAdmin,
    plan,
  });
  // Sightengine path requires a public URL the engine can fetch.
  if (engine === "sightengine" && !blobUrl) {
    return NextResponse.json({ error: t("video.errorNoUpload") }, { status: 400 });
  }

  // --- Persist the job ---
  const { prisma } = await import("@/lib/prisma");
  const job = await prisma.videoJob.create({
    data: {
      userId,
      blobUrl,
      fileName,
      fileSize,
      status: "processing",
      engine,
    },
  });

  let submitError: string | null = null;
  if (engine === "sightengine") {
    try {
      const callbackUrl = `${request.nextUrl.origin}/api/detect-video/webhook?jobId=${job.id}`;
      await submitSightengineVideo({ mediaUrl: blobUrl!, callbackUrl, fileName });
    } catch (e) {
      submitError = e instanceof Error ? e.message : "submit_failed";
      await prisma.videoJob.update({
        where: { id: job.id },
        data: { status: "failed", error: submitError },
      });
    }
  }
  // mock mode: completion handled lazily by the status route (time-based).

  // --- Track usage (counts the attempt) ---
  if (userId && isDatabaseConfigured()) {
    try {
      await incrementVideoUsage(userId);
    } catch (e) {
      console.error("[TrueLens Video] usage increment failed:", e);
    }
  }

  if (submitError) {
    return NextResponse.json({ error: submitError }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    jobId: job.id,
    engine,
    showDetailed,
    auth: userId
      ? {
          authenticated: true,
          unlimited,
          isAdmin,
          plan,
          showDetailed,
          monthlyLimit: monthlyLimit === Infinity ? -1 : monthlyLimit,
          monthlyUsed,
          monthlyRemaining,
        }
      : { authenticated: false, unlimited: false, isAdmin: false, plan: "free", showDetailed: false, monthlyLimit: ANON_MONTHLY_CREDITS, monthlyRemaining: ANON_MONTHLY_CREDITS },
  });
}
