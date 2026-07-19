// Current-user profile (Layer A, #131): plan + credit balance for the UI.
// Falls back gracefully when the database is not configured.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureMonthlyReset } from "@/lib/quota";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, isAdmin: true, credits: true, creditsResetAt: true, email: true },
    });
    if (!user) return NextResponse.json({ authenticated: true, plan: "free", credits: 0 });

    const plan = (user.plan || "free") as "free" | "pro" | "business";
    const isAdmin = !!user.isAdmin;
    const credits =
      isAdmin ? Infinity : await ensureMonthlyReset(prisma, session.user.id, plan, isAdmin);

    return NextResponse.json({
      authenticated: true,
      plan,
      isAdmin,
      email: user.email,
      credits,
      unlimited: isAdmin,
    });
  } catch {
    return NextResponse.json({ authenticated: true, plan: "free", credits: 0 });
  }
}
