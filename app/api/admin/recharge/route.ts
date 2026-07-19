// Admin manual recharge (Layer A, #131) — test helper.
// Lets an admin add credits to any user by email. In production this is also
// how support tops up an account; the real paid path is the payment webhook.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { grantCredits } from "@/lib/quota";

export const runtime = "nodejs";

function parseEmails(env?: string): string[] {
  return (env || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const email = (session?.user?.email || "").toLowerCase();
  const isAdmin =
    !!session?.user?.isAdmin || parseEmails(process.env.ADMIN_EMAILS).includes(email);

  if (!isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { email?: string; credits?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const target = (body.email || "").toLowerCase().trim();
  const amount = Number(body.credits);
  if (!target || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({ where: { email: target } });
    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    const credits = await grantCredits(prisma, user.id, Math.floor(amount));
    return NextResponse.json({ success: true, email: target, credits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
