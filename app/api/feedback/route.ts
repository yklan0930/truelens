import { NextRequest, NextResponse } from "next/server";
import { serverT, detectLocale, type ServerLocale } from "@/lib/i18n/server";

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

    // Structured log for Vercel Runtime Logs
    console.log(
      JSON.stringify({
        service: "TrueLens",
        event: "user_feedback",
        timestamp: new Date().toISOString(),
        locale,
        type,
        rating,       // "good" | "bad" for emoji; undefined for detailed
        message,      // user text (optional)
        resultContext: resultContext ? {
          aiProbability: resultContext.aiProbability,
          verdict: resultContext.verdict,
          fileName: resultContext.fileName,
          processingTimeMs: resultContext.processingTimeMs,
        } : null,
      })
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: t("api.feedbackFailed") }, { status: 500 });
  }
}
