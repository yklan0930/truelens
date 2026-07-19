// Plan metadata — single source of truth for the pricing page, mock
// checkout, and admin recharge (Layer A, #131). Values mirror
// docs/pricing-and-quota-spec.md §3. UI strings live in messages/*.json
// (pricing.* keys); here we keep only the numeric / structural data.

export type PlanId = "free" | "pro" | "business";

export interface PlanInfo {
  id: PlanId;
  priceCny: number; // 0 for free
  monthlyCredits: number;
  highlight?: boolean; // visually emphasize (e.g. Pro)
}

// Order matters for display.
export const PLANS: PlanInfo[] = [
  { id: "free", priceCny: 0, monthlyCredits: 5 },
  { id: "pro", priceCny: 39, monthlyCredits: 500, highlight: true },
  { id: "business", priceCny: 199, monthlyCredits: 5000 },
];

// Add-on pack (spec §3): valid for the current month only.
export const ADDON = { priceCny: 19, credits: 200 };

export function planById(id: string): PlanInfo | undefined {
  return PLANS.find((p) => p.id === id);
}

// Credits granted to a user when they buy/upgrade to a plan.
export function creditsForPlan(plan: PlanId): number {
  return PLANS.find((p) => p.id === plan)?.monthlyCredits ?? 5;
}
