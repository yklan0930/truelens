import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, rating, message, resultContext } = body;

    // Validate
    if (!type || !["emoji", "detailed"].includes(type)) {
      return NextResponse.json({ error: "无效的反馈类型" }, { status: 400 });
    }

    // Structured log for Vercel Runtime Logs
    console.log(
      JSON.stringify({
        service: "TrueLens",
        event: "user_feedback",
        timestamp: new Date().toISOString(),
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
    return NextResponse.json({ error: "反馈提交失败" }, { status: 500 });
  }
}
