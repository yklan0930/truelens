import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/share — store a detection result and return a public id.
// No auth: anyone can create a public share link.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const { result, thumbnail, locale } = body as {
      result?: Record<string, unknown>;
      thumbnail?: string | null;
      locale?: string;
    };

    // Basic shape validation (avoid storing garbage)
    if (
      !result ||
      typeof result.aiProbability !== "number" ||
      typeof result.verdict !== "string" ||
      typeof result.confidence !== "number"
    ) {
      return NextResponse.json({ error: "invalid_result" }, { status: 400 });
    }

    // Guard payload size (thumbnail is a downscaled JPEG data URL, keep it small)
    const thumbStr = typeof thumbnail === "string" ? thumbnail : "";
    if (thumbStr.length > 2_000_000) {
      return NextResponse.json({ error: "thumbnail_too_large" }, { status: 413 });
    }

    const payload = JSON.stringify({ result, thumbnail: thumbStr || null });
    if (payload.length > 3_000_000) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }

    const rec = await prisma.sharedResult.create({
      data: {
        payload,
        locale: typeof locale === "string" && (locale === "zh" || locale === "en") ? locale : "en",
      },
    });

    return NextResponse.json({ id: rec.id });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
