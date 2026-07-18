// Video-detection quota logic. Videos are heavier than images, so they get
// their own daily counters (VideoUsageRecord) and more conservative limits.
// Reuses the same Prisma/Postgres setup as the image quota.

export const VIDEO_ANON_DAILY_LIMIT = 1; // anonymous (no DB row)
export const VIDEO_FREE_DAILY_LIMIT = 3; // logged-in free
export const VIDEO_PRO_DAILY_LIMIT = 20; // pro
// business / admin => unlimited (Infinity)

export function videoDailyLimit(plan: string, isAdmin: boolean, unlimited: boolean): number {
  if (isAdmin || unlimited || plan === "business") return Infinity;
  if (plan === "pro") return VIDEO_PRO_DAILY_LIMIT;
  if (plan === "free") return VIDEO_FREE_DAILY_LIMIT;
  return VIDEO_FREE_DAILY_LIMIT;
}

function getTodayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export interface VideoQuotaState {
  allowed: boolean;
  limit: number; // Infinity for unlimited
  used: number;
}

export async function checkVideoQuota(userId: string): Promise<VideoQuotaState> {
  const { prisma } = await import("@/lib/prisma");
  const today = getTodayDate();
  const rec = await prisma.videoUsageRecord.findUnique({
    where: { userId_date: { userId, date: today } },
  });
  // Limit is resolved by the caller (plan-aware); here we only report usage.
  // The caller compares `used >= limit`.
  return {
    allowed: true,
    limit: Infinity, // caller overrides with videoDailyLimit()
    used: rec?.count ?? 0,
  };
}

export async function incrementVideoUsage(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const today = getTodayDate();
  await prisma.videoUsageRecord.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, count: 1 },
    update: { count: { increment: 1 } },
  });
}
