import { NextRequest, NextResponse } from "next/server";
import { verifySightengineSignature, normalizeSightengineResult } from "@/lib/video/sightengine";
import type { VideoResult } from "@/lib/video/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/detect-video/webhook?jobId=xxx
// Called by Sightengine when async video analysis finishes. The body is signed
// with our api_secret (HMAC-SHA256 in X-Sightengine-Signature); we verify it
// before trusting the payload.
export async function POST(request: NextRequest) {
  if (!process.env.SIGHTENGINE_API_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "missing_job_id" }, { status: 400 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-sightengine-signature");
  if (!verifySightengineSignature(rawBody, signature)) {
    console.warn("[TrueLens Video] webhook signature verification failed");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Sightengine reports failure via `status: "failure"` or `error`.
  const p = payload as { status?: string; error?: { message?: string } };
  if (p.status === "failure" || p.error) {
    const msg = p.error?.message || "engine_failure";
    await prisma.videoJob.update({ where: { id: jobId }, data: { status: "failed", error: msg } });
    return NextResponse.json({ status: "recorded" });
  }

  const result = normalizeSightengineResult(payload, {
    fileName: job.fileName ?? undefined,
    fileSize: job.fileSize ?? undefined,
  });

  await prisma.videoJob.update({
    where: { id: jobId },
    data: { status: "done", result: result as object },
  });

  // Write history for logged-in users.
  if (job.userId) {
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
      console.error("[TrueLens Video] webhook history write failed:", e);
    }
  }

  return NextResponse.json({ status: "ok" });
}
