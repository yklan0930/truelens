import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/line/webhook
// Receives LINE Messaging API events. Verifies X-Line-Signature using the
// channel secret (HMAC-SHA256 of the raw body, base64-encoded).
//
// Currently handles:
//   - follow         → welcome message
//   - text message   → usage hint
//   - image message  → run detection via /api/detect, reply with verdict
//
// Env vars required (set in Vercel):
//   LINE_CHANNEL_SECRET        — to verify signatures
//   LINE_CHANNEL_ACCESS_TOKEN  — to call LINE Reply API
export async function POST(request: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelSecret || !accessToken) {
    console.error("[TrueLens LINE] missing env (LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN)");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // 1) Verify signature — LINE requires 401 on mismatch.
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    console.warn("[TrueLens LINE] signature verification failed");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // 2) Parse events.
  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 3) Handle each event. Reply asynchronously to keep the webhook < 1s.
  //    LINE requires 200 within a few seconds; if we can't, we still return
  //    200 and process in background (a real production setup would queue).
  const replies: LineReply[] = [];
  for (const ev of body.events || []) {
    try {
      const reply = await handleLineEvent(ev, accessToken);
      if (reply) replies.push(reply);
    } catch (e) {
      console.error("[TrueLens LINE] event handler error:", e);
    }
  }

  // If we have replies, push them to LINE Reply API.
  if (replies.length > 0) {
    try {
      await pushLineReply(replies, accessToken);
    } catch (e) {
      console.error("[TrueLens LINE] reply push failed:", e);
    }
  }

  return NextResponse.json({ ok: true });
}

// ─── types ─────────────────────────────────────────────────────────────
interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}
type LineEvent =
  | { type: "follow"; replyToken: string; source: { userId: string } }
  | { type: "unfollow"; source: { userId: string } }
  | { type: "message"; replyToken: string; source: { userId: string }; message: LineMessage };
type LineMessage =
  | { type: "text"; id: string; text: string }
  | { type: "image"; id: string };
interface LineReply {
  type: "text";
  text: string;
}

// ─── signature ─────────────────────────────────────────────────────────
function verifyLineSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  // timingSafeEqual requires equal-length buffers
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ─── event handling ────────────────────────────────────────────────────
async function handleLineEvent(ev: LineEvent, _accessToken: string): Promise<LineReply | null> {
  if (ev.type === "follow") {
    return {
      type: "text",
      text:
        "👋 欢迎来到 TrueLens 透镜！\n" +
        "AI 生成内容真伪检测 — 3 秒出结果。\n\n" +
        "📷 直接发一张图片给我即可开始检测\n" +
        "📋 隐私政策: https://truelens.top/privacy\n" +
        "📑 服务条款: https://truelens.top/terms",
    };
  }

  if (ev.type === "unfollow") {
    return null; // no reply needed
  }

  if (ev.type === "message") {
    if (ev.message.type === "text") {
      const t = ev.message.text.trim().toLowerCase();
      if (t === "ping" || t === "/start" || t === "help" || t === "帮助") {
        return {
          type: "text",
          text:
            "🤖 TrueLens 用法：\n\n" +
            "1. 直接发送一张图片\n" +
            "2. 我会告诉你 AI 生成概率与证据\n\n" +
            "⚠️ 匿名用户每月 1 次精密检测，每天 1 次基础检测。\n" +
            "🌐 网页版: https://truelens.top",
        };
      }
      return {
        type: "text",
        text: "📷 请发送一张图片来检测 AI 真伪。发送「帮助」查看更多。",
      };
    }

    if (ev.message.type === "image") {
      // Hand the image to our internal detector and reply with a formatted
      // summary. We download from LINE content API, then call /api/detect.
      try {
        const result = await detectLineImage(ev.message.id, _accessToken);
        return { type: "text", text: result };
      } catch (e) {
        console.error("[TrueLens LINE] image detect failed:", e);
        return { type: "text", text: "❌ 检测失败，请稍后重试。\n详细: " + String((e as Error)?.message || e) };
      }
    }
  }

  return null;
}

// ─── image detection ───────────────────────────────────────────────────
async function detectLineImage(messageId: string, accessToken: string): Promise<string> {
  // 1) Download the image from LINE content API.
  const contentRes = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!contentRes.ok) {
    throw new Error(`line content api ${contentRes.status}`);
  }
  const buf = Buffer.from(await contentRes.arrayBuffer());

  // 2) Forward to our own /api/detect (multipart form).
  //    We use an internal FormData and Blob. Use only the base (zero-cost)
  //    engine for LINE bot traffic — credits are not tracked for LINE users
  //    yet (TODO when we add a LINE user ↔ TrueLens account mapping).
  const form = new FormData();
  form.append("image", new Blob([buf], { type: "image/jpeg" }), "line.jpg");
  form.append("engine", "base");
  // 显式语言（可用请求 origin 自动检测，但这里硬编 zh 与日文环境更适配）
  form.append("locale", "zh");

  const detectRes = await fetch(
    `${process.env.NEXTAUTH_URL || "https://truelens.top"}/api/detect?locale=zh`,
    { method: "POST", body: form }
  );
  if (!detectRes.ok) {
    const t = await detectRes.text();
    throw new Error(`detect ${detectRes.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await detectRes.json();
  const r = data?.result;
  if (!r) throw new Error("detect: no result");

  const pct = Math.round(r.aiProbability);
  const verdict =
    r.verdict === "likely_ai"
      ? "🚨 高度疑似 AI 生成"
      : r.verdict === "likely_real"
        ? "✅ 高度疑似真实"
        : r.verdict === "likely_edited"
          ? "✏️ 真实但有编辑痕迹"
          : "🤔 不确定";

  return `${verdict}\n\nAI 概率: ${pct}%\n置信度: ${Math.round(r.confidence || 0)}%\n引擎: ⚡ 基础检测\n\n🌐 完整报告: https://truelens.top\n⚠️ 此结果仅供参考`;
}

// ─── reply push ────────────────────────────────────────────────────────
async function pushLineReply(messages: LineReply[], accessToken: string): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken: undefined, messages }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`reply ${res.status}: ${t.slice(0, 200)}`);
  }
}
