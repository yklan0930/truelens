// Monthly credit-based quota system (TrueLens v0.6.6)
//
// Replaces the old daily counters. One detection = 1 credit (image) or
// 8 credits (video). Each plan gets a monthly grant; when a free/anonymous
// user exhausts their high-precision grant we DEGRADE to the zero-cost
// base model instead of blocking — so users are never hard-stopped.
//
// Storage note: we reuse the existing `UsageRecord` / `VideoUsageRecord`
// tables, which are keyed on (userId, date). We simply write the FIRST DAY
// OF THE MONTH as `date`, so each user has exactly one row per month and
// `count` accumulates the monthly credit usage. No schema migration needed.

export type Plan = "free" | "pro" | "business";

// Monthly high-precision credit grants per plan (logged-in users).
export const MONTHLY_CREDITS: Record<Plan, number> = {
  free: 5, // logged-in free users get 5/mo high-precision
  pro: 500,
  business: 5000,
};

// Anonymous users get a SMALL high-precision grant, tracked via an httpOnly
// cookie (no DB row). Server-enforced.
// NEW (CEO 2026-07-22): only the FIRST detection of the month may use
// premium (best first impression); afterwards premium is greyed out and the
// user falls back to the zero-cost base model.
export const ANON_MONTHLY_CREDITS = 1; // anonymous MONTHLY premium grants
export const ANON_DAILY_CAP = 1; // anonymous detections per DAY (hard cap)

// Cost in credits per detection type.
export const IMAGE_COST = 1;
export const VIDEO_COST = 8; // 1 video = 8 images, per pricing spec

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// First day of the current month, at local midnight — used as the `date`
// value for the monthly usage row.
export function firstOfMonth(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Resolve a user's monthly credit limit.
// Admin / business / explicitly-unlimited => Infinity (no cap).
export function monthlyLimitFor(
  plan: Plan,
  isAdmin: boolean,
  unlimited: boolean
): number {
  if (isAdmin || unlimited) return Infinity;
  return MONTHLY_CREDITS[plan] ?? MONTHLY_CREDITS.free;
}

// Whether the remaining balance covers `cost` credits.
export function hasCredits(
  used: number,
  limit: number,
  cost: number
): boolean {
  if (limit === Infinity) return true;
  return used + cost <= limit;
}

// ─────────────────────────────────────────────────────────────────────────
// Layer A (#131): DB-backed credit BALANCE + global ops budget gate.
// These helpers are provider-agnostic — they never touch Stripe / WeChat /
// Alipay. Wiring a real payment adapter only needs to call `grantCredits()`.
// ─────────────────────────────────────────────────────────────────────────

// Global monthly Sightengine ops budget (spec §5.1). When this month's ops
// hit the cap we force non-admins onto the zero-cost base model so the
// vendor bill can never run away.
export const MAX_SE_OPS_PER_MONTH = Number(
  process.env.MAX_SE_OPS_PER_MONTH ?? 10000
); // Starter tier = 10k ops

// Reset a user's monthly credit grant if we're in a new month (or they've
// never been granted). Returns the current balance. Admins are unlimited.
export async function ensureMonthlyReset(
  prisma: any,
  userId: string,
  plan: Plan,
  isAdmin: boolean
): Promise<number> {
  if (isAdmin) return Infinity;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, creditsResetAt: true },
  });
  if (!user) return 0;
  const reset = user.creditsResetAt ? new Date(user.creditsResetAt) : null;
  if (!reset || reset < firstOfMonth()) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: MONTHLY_CREDITS[plan] ?? 0, creditsResetAt: new Date() },
    });
    return MONTHLY_CREDITS[plan] ?? 0;
  }
  return user.credits;
}

// Atomically decrement `cost` credits. Throws if the balance is too low so
// callers never over-spend (spec §5.5 — atomic deduction, no over-issue).
export async function atomicDecrementCredits(
  prisma: any,
  userId: string,
  cost: number
): Promise<number> {
  const updated = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: cost } },
    data: { credits: { decrement: cost } },
  });
  if (updated.count === 0) {
    throw new Error("INSUFFICIENT_CREDITS");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  return user?.credits ?? 0;
}

// Grant credits (purchase / plan upgrade / admin top-up). Always additive.
export async function grantCredits(
  prisma: any,
  userId: string,
  amount: number
): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: amount } },
    select: { credits: true },
  });
  return user.credits;
}

// ── Global monthly ops counter (spec §5.1) ──

export async function getMonthlyOps(prisma: any, month: string): Promise<number> {
  const row = await prisma.monthlyOps.findUnique({ where: { month } });
  return row?.ops ?? 0;
}

export async function incrementMonthlyOps(
  prisma: any,
  month: string,
  n: number
): Promise<number> {
  const row = await prisma.monthlyOps.upsert({
    where: { month },
    create: { month, ops: n },
    update: { ops: { increment: n } },
  });
  return row.ops;
}

export function opsBudgetExhausted(ops: number): boolean {
  return ops >= MAX_SE_OPS_PER_MONTH;
}

