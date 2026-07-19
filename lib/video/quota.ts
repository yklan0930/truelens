// Video-detection quota (TrueLens v0.6.6)
//
// Videos draw from the SAME monthly credit pool as images — each video costs
// VIDEO_COST (8) credits, so a free user (3 credits/mo) cannot run a video,
// while a Pro user (500) gets ~62 videos/mo. We reuse the existing
// `video_usage_records` table keyed on (userId, date); `date` is written as
// the FIRST DAY OF THE MONTH, so a user has one row per month and `count`
// accumulates the credits spent on videos this month. No schema migration.

import { monthlyLimitFor, VIDEO_COST, firstOfMonth, type Plan } from "@/lib/quota";

export { VIDEO_COST };

// Resolve a user's monthly credit limit (same pool as images).
export function videoMonthlyLimit(
  plan: Plan,
  isAdmin: boolean,
  unlimited: boolean
): number {
  return monthlyLimitFor(plan, isAdmin, unlimited);
}

export interface VideoQuotaState {
  allowed: boolean; // enough credits for one video (VIDEO_COST)?
  limit: number; // monthly credit limit (Infinity for unlimited)
  used: number; // video-credits used this month
  cost: number; // = VIDEO_COST
}

export async function checkVideoQuota(userId: string): Promise<VideoQuotaState> {
  const { prisma } = await import("@/lib/prisma");
  const rec = await prisma.videoUsageRecord.findUnique({
    where: { userId_date: { userId, date: firstOfMonth() } },
  });
  // `used` is cumulative video-credits (each video adds VIDEO_COST).
  return {
    allowed: true, // caller compares against its own limit
    limit: Infinity,
    used: rec?.count ?? 0,
    cost: VIDEO_COST,
  };
}

export async function incrementVideoUsage(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  await prisma.videoUsageRecord.upsert({
    where: { userId_date: { userId, date: firstOfMonth() } },
    create: { userId, date: firstOfMonth(), count: VIDEO_COST },
    update: { count: { increment: VIDEO_COST } },
  });
}
