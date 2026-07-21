import { NextRequest, NextResponse } from "next/server";
import { serverT, detectLocale, type ServerLocale } from "@/lib/i18n/server";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const locale: ServerLocale = detectLocale(request.headers.get("accept-language"));
  const t = (key: string, params?: Record<string, string | number>) =>
    serverT(locale, key, params);

  try {
    const body = await request.json();
    const { type, rating, message, resultContext } = body;

    // Validate
    if (!type || !["emoji", "detailed"].includes(type)) {
      return NextResponse.json({ error: t("api.invalidFeedbackType") }, { status: 400 });
    }

    // Identify the submitter if logged in (anonymous feedback still allowed)
    const session = await auth();
    const userId = session?.user?.id || null;
    const email = session?.user?.email || null;

    // Persist so staff can review in /admin/feedback
    const { prisma } = await import("@/lib/prisma");
    const data: any = {
      type,
      locale,
      userId,
      email,
    };
    if (rating) data.rating = rating;
    if (message) data.message = message;
    if (resultContext) data.resultContext = resultContext;

    await prisma.feedback.create({ data });

    // Keep a structured log for Vercel Runtime Logs as well
    console.log(
      JSON.stringify({
        service: "TrueLens",
        event: "user_feedback",
        timestamp: new Date().toISOString(),
        locale,
        type,
        rating,
        message,
        userId,
        email,
        resultContext: resultContext
          ? {
              aiProbability: resultContext.aiProbability,
              verdict: resultContext.verdict,
              fileName: resultContext.fileName,
              processingTimeMs: resultContext.processingTimeMs,
            }
          : null,
      })
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: t("api.feedbackFailed") }, { status: 500 });
  }
}
