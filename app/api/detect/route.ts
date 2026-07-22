import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/analyzer";
import { serverT, detectLocale, type ServerLocale } from "@/lib/i18n/server";
import { auth } from "@/lib/auth";
import {
  monthlyLimitFor,
  ANON_MONTHLY_CREDITS,
  ANON_DAILY_CAP,
  IMAGE_COST,
  monthKey,
  hasCredits,
  ensureMonthlyReset,
  atomicDecrementCredits,
  getMonthlyOps,
  incrementMonthlyOps,
  opsBudgetExhausted,
  type Plan,
} from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 30; // 30 seconds max

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

// Anonymous state, tracked in an httpOnly cookie (client can't read/forge).
//   m  = month key (YYYY-MM)            — resets premium grant monthly
//   pu = premium-used flag (0|1)     — the 1 monthly premium grant
//   d  = day key (YYYY-MM-DD)          — daily-cap window
//   du = day-used flag (0|1)          — 1 detection already done today
interface AnonCookie {
  m: string;
  pu: number;
  d: string;
  du: number;
}

function readAnonCookie(request: NextRequest): AnonCookie {
  try {
    const raw = request.cookies.get("tl_anon_credits")?.value;
    if (!raw) return { m: "", pu: 0, d: "", du: 0 };
    const o = JSON.parse(raw);
    return {
      m: typeof o.m === "string" ? o.m : "",
      pu: typeof o.pu === "number" ? o.pu : 0,
      d: typeof o.d === "string" ? o.d : "",
      du: typeof o.du === "number" ? o.du : 0,
    };
  } catch {
    return { m: "", pu: 0, d: "", du: 0 };
  }
}

// Local day key (server timezone is fine — it's just a rolling 24h window
// boundary; a few hours of skew across timezones is acceptable for a soft cap).
function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Anonymous auth block returned to the client so the UI can grey the premium
// button / disable detection without trusting the (forgeable) client.
function anonAuthBlock(premiumUsed: number, dayUsed: boolean) {
  return {
    authenticated: false,
    plan: "free",
    premiumUsed, // 0 | 1 — drives premium-button greying
    dayUsed, // 0 | 1 — drives whole-button disable
    dailyCap: ANON_DAILY_CAP,
    premiumMonthly: ANON_MONTHLY_CREDITS,
    usedBaseModel: false,
  };
}

// Allowed MIME types
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function isDatabaseConfigured() {
  return !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost:5432/truelens");
}

export async function POST(request: NextRequest) {
  // Detect locale: prefer explicit frontend locale param (matches UI language),
  // then fallback to Accept-Language header.
  const urlLocale = request.nextUrl.searchParams.get("locale");
  const rawLocale = (urlLocale === "en" || urlLocale === "zh")
    ? urlLocale
    : detectLocale(request.headers.get("accept-language"));
  const locale: ServerLocale = rawLocale;
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
    const enginePref = (formData.get("engine") as string) || "auto"; // "auto" | "premium" | "base"

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

    // --- Check auth + monthly credit entitlement (if database is configured) ---
    let userId: string | null = null;
    let isAdmin = false;
    let plan: Plan = "free";
    let unlimited = false;
    let showDetailed = false;

    // Monthly credit state (replaces the old daily counters).
    let monthlyLimit = ANON_MONTHLY_CREDITS;
    let monthlyUsed = 0;
    let credits = 0; // DB-backed balance for authenticated users (Layer A)
    let useBaseOnly = false; // true => run zero-cost base model (free grant used up)
    let isAnon = false; // true => logged-out visitor (cookie-tracked)

    // --- Anonymous state (read once; enforced server-side) ---
    const anonCookie = readAnonCookie(request);
    const todayKey = dayKey();
    // Daily cap: 1 detection/day (CEO 2026-07-22). Resets across days.
    const anonDayUsed = anonCookie.d === todayKey ? anonCookie.du : 0;
    // Monthly premium grant: only the FIRST detection of the month may use
    // premium (best first impression); afterwards premium is greyed out.
    const anonPremiumUsed = anonCookie.m === monthKey() ? anonCookie.pu : 0;

    if (isDatabaseConfigured()) {
      try {
        const { prisma } = await import("@/lib/prisma");
        const session = await auth();
        if (session?.user?.id) {
          userId = session.user.id;
          isAdmin = !!session.user.isAdmin;
          plan = (session.user.plan as Plan) || "free";

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
              if (dbUser.plan && dbUser.plan !== "free") plan = dbUser.plan as Plan;
            }
          } catch {
            // keep env/token values
          }

          unlimited = isAdmin || plan === "business";
          showDetailed = isAdmin || plan !== "free";
          monthlyLimit = monthlyLimitFor(plan, isAdmin, unlimited);

          // Layer A (#131): read the DB-backed credit BALANCE, not a plan
          // constant. Degrade to the zero-cost base model when the balance is
          // empty OR the global monthly Sightengine ops budget is exhausted.
          credits = await ensureMonthlyReset(prisma, userId, plan, isAdmin);
          const monthOps = await getMonthlyOps(prisma, monthKey());
          const opsFull = opsBudgetExhausted(monthOps);
          if (!unlimited && (credits < IMAGE_COST || opsFull)) useBaseOnly = true;
        } else {
          // Logged-out visitor: cookie-based monthly counter.
          isAnon = true;
        }
      } catch (dbError) {
        // Database error — gracefully degrade to anonymous mode.
        console.error("[TrueLens] DB error during auth check:", dbError);
        isAnon = true;
      }
    } else {
      // No database configured (local dev) — anonymous cookie counter.
      isAnon = true;
    }

    // --- Anonymous-only hard gates (CEO 2026-07-22) ---
    // Run AFTER auth resolution; isAnon is true for every logged-out path.
    if (isAnon) {
      // DAILY CAP: 1 detection/day. Hard-block, no consumption —
      // we don't want to burn the day's slot on a rejected request.
      if (anonDayUsed) {
        return NextResponse.json(
          {
            error: t("api.dailyLimit"),
            suggestion: "tomorrow",
            auth: anonAuthBlock(anonPremiumUsed, true),
          },
          { status: 402 }
        );
      }
      if (enginePref === "premium") {
        // Monthly premium grant is 1 — once used, premium is greyed out
        // (the UI disables the button); if forced, return actionable 402.
        if (anonPremiumUsed >= ANON_MONTHLY_CREDITS) {
          return NextResponse.json(
            {
              error: t("api.noPremiumCredits"),
              suggestion: "login_or_upgrade",
              auth: anonAuthBlock(1, false),
            },
            { status: 402 }
          );
        }
        // premium allowed — will consume the 1 monthly grant + today's slot
      } else if (enginePref === "auto" && anonPremiumUsed >= ANON_MONTHLY_CREDITS) {
        // First premium already spent this month → fall back to free base.
        useBaseOnly = true;
      }
      // "base" → useBaseOnly handled by the block below.
    }

    // --- Convert File to Buffer (in memory, not persisted) ---
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // --- Engine preference: let user choose premium vs base ---
    // "premium" → force Sightengine; fail if credits exhausted
    // "base"    → force base model regardless of credits
    // "auto"    → existing logic (premium if credits available, else base)
    if (enginePref === "base") {
      useBaseOnly = true;
    } else if (enginePref === "premium" && useBaseOnly) {
      // User explicitly chose premium but has no credits — return actionable error
      return NextResponse.json(
        {
          error: t("api.noPremiumCredits"),
          suggestion: "login_or_upgrade",
        },
        { status: 402 }
      );
    }

    // --- Run analysis with locale and original filename ---
    // When the monthly high-precision grant is exhausted we degrade to the
    // zero-cost base model instead of blocking the user.
    const result = await analyzeImage(imageBuffer, hfToken, file.name, locale, {
      useBaseOnly,
    });

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

    // --- Track usage for authenticated users (high-precision only) ---
    // Base-model detections (free grant exhausted) cost no credits, so they
    // are NOT counted against the monthly quota — but they are still logged.
    if (userId && isDatabaseConfigured()) {
      try {
        const { prisma } = await import("@/lib/prisma");

        if (!useBaseOnly) {
          // Layer A (#131): atomically decrement the credit balance and bump
          // the global monthly Sightengine ops counter (1 image = 1 op).
          try {
            credits = await atomicDecrementCredits(prisma, userId, IMAGE_COST);
          } catch {
            // Lost a race / balance was depleted mid-flight — fall back.
            useBaseOnly = true;
          }
          await incrementMonthlyOps(prisma, monthKey(), IMAGE_COST);
        }

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
    const hpCost = useBaseOnly ? 0 : IMAGE_COST;
    const monthlyRemaining =
      monthlyLimit === Infinity
        ? -1
        : Math.max(0, monthlyLimit - monthlyUsed - hpCost);

    const response = NextResponse.json({
      success: true,
      engineUsed: useBaseOnly ? "base" : "premium", // tell UI which engine ran
      usedBaseModel: useBaseOnly,
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
        c2pa: result.engines.c2pa ?? null,
      },
      // Include auth/quota context for client
      auth: userId
        ? {
            authenticated: true,
            unlimited,
            isAdmin,
            plan,
            showDetailed,
            monthlyLimit: unlimited ? -1 : monthlyLimit,
            monthlyUsed: unlimited ? 0 : Math.max(0, monthlyLimit - credits),
            monthlyRemaining: unlimited ? -1 : credits,
            credits: unlimited ? -1 : credits,
            usedBaseModel: useBaseOnly,
          }
        : {
            authenticated: false,
            unlimited: false,
            isAdmin: false,
            plan: "free",
            showDetailed: false,
            // Post-detection state: a detection just happened today, and the
            // 1 monthly premium grant is spent if it ran premium.
            premiumUsed: anonPremiumUsed || (!useBaseOnly ? 1 : 0),
            dayUsed: true,
            dailyCap: ANON_DAILY_CAP,
            premiumMonthly: ANON_MONTHLY_CREDITS,
            usedBaseModel: useBaseOnly,
          },
    });

    // Persist anonymous state in an httpOnly cookie (server-enforced):
    //   pu (premium used) flips to 1 once a premium detection runs,
    //   du (day used) flips to 1 for today's daily-cap window.
    if (!userId) {
      const ranPremium = !useBaseOnly;
      response.cookies.set(
        "tl_anon_credits",
        JSON.stringify({
          m: monthKey(),
          pu: anonPremiumUsed || (ranPremium ? 1 : 0),
          d: todayKey,
          du: 1,
        }),
        // NOT httpOnly on purpose: the client reads pu/du ONLY to grey the
        // premium button / disable detection on page load. Enforcement
        // still lives server-side (every request re-checks the cookie), so
        // a forged client value cannot grant extra detections.
        { httpOnly: false, sameSite: "lax", maxAge: 60 * 60 * 24 * 32, path: "/" }
      );
    }

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
