// Unified checkout endpoint (Layer A mock + Layer B Polar).
//
// The client always POSTs { productKey: "pro" | "business" | "addon" } here.
//  • If Polar is configured  → create a hosted Polar checkout, return {mode:"redirect", url}.
//  • Otherwise (no keys)     → grant immediately (mock), return {mode:"mock", credits}.
//
// This keeps the pricing page unaware of which payment backend is live.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { polarEnabled, createCheckout } from "@/lib/payments/polar";
import { PLANS, ADDON, creditsForPlan, type PlanId } from "@/lib/pricing";
import { grantCredits } from "@/lib/quota";

export const runtime = "nodejs";

const VALID = new Set(["pro", "business", "addon"]);

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { productKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const productKey = body.productKey;
  if (!productKey || !VALID.has(productKey)) {
    return NextResponse.json({ error: "invalid_product" }, { status: 400 });
  }

  // ── Real Polar checkout (overseas MoR) ──
  if (polarEnabled()) {
    try {
      const url = await createCheckout({
        userId: session.user.id,
        email: (session.user as { email?: string }).email,
        productKey,
      });
      if (!url) {
        return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
      }
      return NextResponse.json({ mode: "redirect", url });
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── Mock fallback (no real payment) ──
  try {
    const { prisma } = await import("@/lib/prisma");
    const userId = session.user.id;

    let granted = 0;
    if (productKey === "addon") {
      granted = ADDON.credits;
      await grantCredits(prisma, userId, granted);
    } else {
      const plan = productKey as PlanId;
      await prisma.user.update({ where: { id: userId }, data: { plan } });
      granted = creditsForPlan(plan);
      await grantCredits(prisma, userId, granted);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    return NextResponse.json({
      mode: "mock",
      success: true,
      productKey,
      granted,
      credits: user?.credits ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
