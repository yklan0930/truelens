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

// Anonymous users get the same free grant, tracked via an httpOnly cookie
// (no DB row). Server-enforced.
export const ANON_MONTHLY_CREDITS = 3;

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
