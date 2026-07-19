// Mock checkout (Layer A, #131) — provider-agnostic, NO real payment.
// Demonstrates the full loop: pick a plan -> grant credits -> balance rises.
// Layer B (WeChat/Alipay) will replace this with a real payment adapter
// that calls `grantCredits()` on the webhook callback.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { grantCredits } from "@/lib/quota";
import { creditsForPlan } from "@/lib/pricing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const plan = body.plan;
  if (plan !== "pro" && plan !== "business") {
    return NextResponse.json(
      { error: "invalid_plan", message: "Only pro/business can be purchased (free is default)." },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const userId = session.user.id;

    // Set the plan and grant the plan's monthly credits (additive, mock).
    await prisma.user.update({
      where: { id: userId },
      data: { plan },
    });
    const granted = creditsForPlan(plan as any);
    const credits = await grantCredits(prisma, userId, granted);

    return NextResponse.json({
      success: true,
      plan,
      granted,
      credits,
      mock: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
