// POST /api/detect-video/process
// Frame-based video detection (FREE path). Client extracts N frames from the
// video locally with HTMLCanvasElement and POSTs them as multipart/form-data.
// Server runs the existing image detection pipeline on each frame, aggregates
// the per-frame scores, and returns a single VideoResult.
//
// Quota: counts as 1 VIDEO detection against `video_usage_records` (not image
// quota). Each video submission is one slot regardless of frame count.

import { NextRequest, NextResponse } from "next/server";
import {
  aggregateFrameResults,
  type FrameDetection,
} from "@/lib/video/aggregateFrames";
import {
  incrementVideoUsage,
} from "@/lib/video/quota";
import { auth } from "@/lib/auth";
import type { VideoResult } from "@/lib/video/types";
import {
  monthlyLimitFor,
  ANON_MONTHLY_CREDITS,
  VIDEO_COST,
  ensureMonthlyReset,
  atomicDecrementCredits,
  getMonthlyOps,
  incrementMonthlyOps,
  opsBudgetExhausted,
  monthKey,
  type Plan,
} from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 60; // up to 8 frames * HF model latency
export const dynamic = "force-dynamic";

const MAX_FRAMES = 12;
const MAX_FRAME_SIZE = 6 * 1024 * 1024; // 6MB per frame (decoded JPEG)

function parseEmails(env?: string): string[] {
  return (env || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isDatabaseConfigured() {
  const url = process.env.DATABASE_URL;
  return !!url && !url.includes("localhost:5432/truelens");
}

interface AuthInfo {
  userId: string | null;
  isAdmin: boolean;
  plan: Plan;
  unlimited: boolean;
  showDetailed: boolean;
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
}

async function resolveAuth(): Promise<AuthInfo> {
  const info: AuthInfo = {
    userId: null,
    isAdmin: false,
    plan: "free",
    unlimited: false,
    showDetailed: false,
    monthlyLimit: ANON_MONTHLY_CREDITS,
    monthlyUsed: 0,
    monthlyRemaining: ANON_MONTHLY_CREDITS,
  };
  if (!isDatabaseConfigured()) return info;

  try {
    const { prisma } = await import("@/lib/prisma");
    const session = await auth();
    if (session?.user?.id) {
      info.userId = session.user.id;
      info.isAdmin = !!session.user.isAdmin;
      info.plan = (session.user.plan as Plan) || "free";
      const adminEmails = parseEmails(process.env.ADMIN_EMAILS);
      const paidEmails = parseEmails(process.env.PAID_EMAILS);
      const email = (session.user.email || "").toLowerCase();
      if (email && adminEmails.includes(email)) info.isAdmin = true;
      if (email && paidEmails.includes(email) && info.plan === "free") info.plan = "pro";
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: info.userId },
          select: { isAdmin: true, plan: true },
        });
        if (dbUser) {
          if (dbUser.isAdmin) info.isAdmin = true;
          if (dbUser.plan && dbUser.plan !== "free") info.plan = dbUser.plan as Plan;
        }
      } catch { /* keep */ }

      info.unlimited = info.isAdmin || info.plan === "business";
      info.showDetailed = info.isAdmin || info.plan !== "free";
      info.monthlyLimit = monthlyLimitFor(info.plan, info.isAdmin, info.unlimited);

      // Layer A (#131): videos draw from the SAME credit pool as images.
      // Block (429) only when the balance can't cover VIDEO_COST (8) or the
      // global monthly ops budget is exhausted.
      const credits = await ensureMonthlyReset(prisma, info.userId, info.plan, info.isAdmin);
      const monthOps = await getMonthlyOps(prisma, monthKey());
      const opsFull = opsBudgetExhausted(monthOps);
      if (!info.unlimited && (credits < VIDEO_COST || opsFull)) {
        throw new Error("QUOTA_EXHAUSTED");
      }
      info.monthlyUsed = info.unlimited ? 0 : Math.max(0, info.monthlyLimit - credits);
      info.monthlyRemaining = info.unlimited ? -1 : credits;
    } else {
      // Anonymous visitors cannot run videos (cost 8 > anon grant of 3).
      throw new Error("QUOTA_EXHAUSTED");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "QUOTA_EXHAUSTED") throw e;
    console.error("[TrueLens Video Frames] auth error:", e);
  }
  return info;
}

export async function POST(request: NextRequest) {
  let authInfo: AuthInfo;
  try {
    authInfo = await resolveAuth();
  } catch (e) {
    if (e instanceof Error && e.message === "QUOTA_EXHAUSTED") {
      return NextResponse.json({ error: "quotaExhausted" }, { status: 429 });
    }
    return NextResponse.json({ error: "authFailed" }, { status: 500 });
  }

  const t0 = Date.now();
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalidFormData" }, { status: 400 });
  }

  const files = formData.getAll("frame").filter((f): f is File => f instanceof File);
  const fileName = (formData.get("fileName") as string | null) || "video";

  if (files.length === 0) {
    return NextResponse.json({ error: "noFramesProvided" }, { status: 400 });
  }
  if (files.length > MAX_FRAMES) {
    return NextResponse.json({ error: "tooManyFrames", max: MAX_FRAMES }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_FRAME_SIZE) {
      return NextResponse.json({ error: "frameTooLarge", max: MAX_FRAME_SIZE }, { status: 413 });
    }
  }

  // Score each frame with Sightengine's `genai` image model (serialized +
  // 429-retried so the free tier's 1 req/s limit doesn't silently degrade
  // results). Falls back to the full analyzer when Sightengine is off.
  const { detectFrames } = await import("@/lib/video/framesDetect");

  const frameInputs = await Promise.all(
    files.map(async (f) => ({ buf: Buffer.from(await f.arrayBuffer()), name: f.name || "frame" }))
  );
  const perFrame: FrameDetection[] = await detectFrames(frameInputs);

  const aggregated = aggregateFrameResults(perFrame, { fileName });
  const processingTimeMs = Date.now() - t0;
  const result: VideoResult = { ...aggregated, processingTimeMs };

  // Track video usage: 1 video = VIDEO_COST (8) credits from the shared pool,
  // plus 8 ops against the global monthly Sightengine budget.
  if (authInfo.userId && isDatabaseConfigured()) {
    try {
      const { prisma } = await import("@/lib/prisma");
      await atomicDecrementCredits(prisma, authInfo.userId, VIDEO_COST);
      await incrementMonthlyOps(prisma, monthKey(), VIDEO_COST);
    } catch (e) {
      console.error("[TrueLens Video Frames] credit decrement failed:", e);
    }
  }

  // History write (only for paid/admin — they get a record)
  if (authInfo.userId && isDatabaseConfigured() && authInfo.showDetailed) {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.detectionHistory.create({
        data: {
          userId: authInfo.userId,
          imageName: fileName,
          aiProbability: result.aiProbability,
          isAI: result.verdict === "likely_ai",
          confidence: result.confidence,
          processingTimeMs: result.processingTimeMs,
          evidence: JSON.parse(JSON.stringify(result.evidence)),
          locale: "en",
        },
      });
    } catch (e) {
      console.error("[TrueLens Video Frames] history write failed:", e);
    }
  }

  return NextResponse.json({
    success: true,
    engine: "frames",
    result,
    auth: {
      authenticated: !!authInfo.userId,
      unlimited: authInfo.unlimited,
      isAdmin: authInfo.isAdmin,
      plan: authInfo.plan,
      showDetailed: authInfo.showDetailed,
      monthlyLimit: authInfo.monthlyLimit === Infinity ? -1 : authInfo.monthlyLimit,
      monthlyUsed: authInfo.monthlyUsed,
      monthlyRemaining: authInfo.monthlyRemaining,
      usedBaseModel: false,
    },
  });
}
