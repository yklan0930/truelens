// Polar webhook receiver (Layer B, overseas MoR).
//
// Configure in Polar dashboard → Organization Settings → Webhooks:
//   Endpoint URL: https://www.truelens.top/api/webhooks/polar
//   Subscribe to: order.paid, subscription.created, subscription.active,
//                  subscription.canceled, subscription.revoked
//   Generate a secret and set POLAR_WEBHOOK_SECRET.
//
// Polar signs with the Standard Webhooks spec; we verify with the official
// SDK before touching the database.

import { NextRequest, NextResponse } from "next/server";
import { verifyPolarWebhook, applyPolarEvent } from "@/lib/payments/polar";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const raw = await request.text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let payload: unknown;
  try {
    payload = verifyPolarWebhook(raw, headers);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 403;
    return NextResponse.json({ error: "invalid_signature" }, { status });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    await applyPolarEvent(prisma, payload);
  } catch (e) {
    console.error("[polar webhook] apply failed:", e);
    // Return 500 so Polar retries the same event (idempotency prevents
    // double-grant on retry).
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
