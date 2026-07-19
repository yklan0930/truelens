import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveVideoEngine } from "@/lib/video/engine";
import {
  monthlyLimitFor,
  ANON_MONTHLY_CREDITS,
  VIDEO_COST,
  firstOfMonth,
  hasCredits,
  type Plan,
} from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/detect-video/prepare?name=...&size=...
// Returns what the browser needs to upload the video OUTSIDE Vercel functions
// (so we never hit the 4.5 MB body limit), plus the engine preference for the
// current user.
//
// Engines:
//   - "sightengine": blob upload + Sightengine async path. Requires blob
//     configured, Sightengine credentials, and a paid/admin user.
//   - "frames": client-side frame extraction + free image API. Always
//     available; the default for free users and when no paid engine is set up.
//
// Response shape:
//   { configured: boolean, engine: "frames"|"sightengine", pathname?: string,
//     auth: { authenticated, isAdmin, plan, showDetailed, monthlyLimit, monthlyRemaining } }
export async function GET(request: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // Resolve user plan (if DB is configured) to pick the right engine.
  let isAdmin = false;
  let plan: Plan = "free";
  let authenticated = false;
  let unlimited = false;
  let showDetailed = false;
  let monthlyLimit = ANON_MONTHLY_CREDITS;
  let monthlyUsed = 0;
  let monthlyRemaining = ANON_MONTHLY_CREDITS;
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost:5432/truelens")) {
    try {
      const session = await auth();
      if (session?.user?.id) {
        authenticated = true;
        isAdmin = !!session.user.isAdmin;
        plan = (session.user.plan as Plan) || "free";

        const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        const paidEmails = (process.env.PAID_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        const email = (session.user.email || "").toLowerCase();
        if (email && adminEmails.includes(email)) isAdmin = true;
        if (email && paidEmails.includes(email) && plan === "free") plan = "pro";

        try {
          const { prisma } = await import("@/lib/prisma");
          const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { isAdmin: true, plan: true },
          });
          if (dbUser) {
            if (dbUser.isAdmin) isAdmin = true;
            if (dbUser.plan && dbUser.plan !== "free") plan = dbUser.plan as Plan;
          }
        } catch { /* keep */ }

        unlimited = isAdmin || plan === "business";
        showDetailed = isAdmin || plan !== "free";
        monthlyLimit = monthlyLimitFor(plan, isAdmin, unlimited);

        // Read this month's video-credit usage for an accurate remaining count.
        try {
          const { prisma } = await import("@/lib/prisma");
          const usage = await prisma.videoUsageRecord.findUnique({
            where: { userId_date: { userId: session.user.id, date: firstOfMonth() } },
          });
          monthlyUsed = usage?.count ?? 0;
        } catch { /* keep */ }
        monthlyRemaining =
          monthlyLimit === Infinity
            ? -1
            : Math.max(0, monthlyLimit - monthlyUsed);
      }
    } catch { /* anonymous fallback */ }
  }

  const engine = resolveVideoEngine({
    isAuthenticated: authenticated,
    isAdmin,
    plan,
  });

  if (engine === "sightengine") {
    if (!token) {
      // Paid engine chosen but no blob — fall back to frames.
      return NextResponse.json({
        configured: false,
        engine: "frames",
        auth: { authenticated, isAdmin, plan, showDetailed, monthlyLimit, monthlyRemaining, unlimited },
      });
    }
    const origName =
      (request.nextUrl.searchParams.get("name") || "video").replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `videos/${Date.now()}-${origName}`;
    return NextResponse.json({
      configured: true,
      engine: "sightengine",
      pathname,
      auth: { authenticated, isAdmin, plan, showDetailed, monthlyLimit, monthlyRemaining, unlimited },
    });
  }

  // "frames" (default, free): no blob upload needed; client does extraction.
  return NextResponse.json({
    configured: false,
    engine: "frames",
    auth: { authenticated, isAdmin, plan, showDetailed, monthlyLimit, monthlyRemaining, unlimited },
  });
}
