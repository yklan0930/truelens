import { NextRequest, NextResponse } from "next/server";
import { detectLocale, serverT, type ServerLocale } from "@/lib/i18n/server";
import { auth } from "@/lib/auth";
import { synthesizeVideoResult, MOCK_PROCESSING_MS } from "@/lib/video/mock";
import type { VideoResult } from "@/lib/video/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEmails(env?: string): string[] {
  return (env || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// GET /api/detect-video/status?jobId=xxx
export async function GET(request: NextRequest) {
  const locale: ServerLocale = detectLocale(request.headers.get("accept-language"));
  const t = (key: string, params?: Record<string, string | number>) => serverT(locale, key, params);

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: t("api.missingJobId") }, { status: 400 });

  const { prisma } = await import("@/lib/prisma");
  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: t("api.notFound") }, { status: 404 });

  // --- Mock mode: complete lazily based on elapsed time (no timers needed) ---
  if (job.status === "processing" && job.engine === "mock") {
    const elapsed = Date.now() - job.createdAt.getTime();
    if (elapsed >= MOCK_PROCESSING_MS) {
      const result = synthesizeVideoResult({ fileName: job.fileName ?? undefined, fileSize: job.fileSize ?? undefined });
      await prisma.videoJob.update({
        where: { id: job.id },
        data: { status: "done", result: result as object },
      });
      await writeHistory(prisma, job, result);
      job.status = "done";
      (job as any).result = result;
    }
  }

  if (job.status !== "done") {
    return NextResponse.json({ status: job.status, jobId });
  }

  // --- Derive entitlement for the *current* viewer (paywall) ---
  let showDetailed = false;
  try {
    const session = await auth();
    if (session?.user?.id) {
      const email = (session.user.email || "").toLowerCase();
      const adminEmails = parseEmails(process.env.ADMIN_EMAILS);
      const paidEmails = parseEmails(process.env.PAID_EMAILS);
      let isAdmin = !!session.user.isAdmin || adminEmails.includes(email);
      let plan = session.user.plan || "free";
      if (paidEmails.includes(email) && plan === "free") plan = "pro";
      try {
        const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true, plan: true } });
        if (dbUser) { if (dbUser.isAdmin) isAdmin = true; if (dbUser.plan && dbUser.plan !== "free") plan = dbUser.plan; }
      } catch { /* keep */ }
      showDetailed = isAdmin || plan !== "free";
    }
  } catch { /* anonymous → no detailed report */ }

  const full = (job.result ?? {}) as unknown as VideoResult;
  const result: VideoResult = showDetailed
    ? full
    : { ...full, evidence: [] }; // strip detailed evidence for trial users

  return NextResponse.json({ status: "done", jobId, showDetailed, result });
}

async function writeHistory(prisma: any, job: any, result: VideoResult) {
  if (!job.userId) return;
  try {
    await prisma.detectionHistory.create({
      data: {
        userId: job.userId,
        imageName: job.fileName || "video",
        aiProbability: result.aiProbability,
        isAI: result.verdict === "likely_ai",
        confidence: result.confidence,
        processingTimeMs: result.processingTimeMs,
        evidence: JSON.parse(JSON.stringify(result.evidence)),
        locale: "en",
      },
    });
  } catch (e) {
    console.error("[TrueLens Video] history write failed:", e);
  }
}
