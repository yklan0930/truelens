// Polar.sh adapter (Layer B, overseas MoR) — TrueLens v0.6.9+
//
// Polar is a Merchant of Record: it charges global cards, remits VAT/GST, and
// pays YOU out. As a Chinese individual you can receive payouts (Polar uses
// Stripe Connect Express, which supports many more countries than Stripe
// standalone). This file is the ONLY Polar-aware code; everything else stays
// provider-agnostic and just calls `grantCredits()` / sets `plan`.
//
// Flow:
//   /api/checkout  ──(configured)──▶ polar.checkouts.create → redirect to Polar
//   Polar         ──webhook────────▶ /api/webhooks/polar → verify → grantCredits
//
// Events used (Polar SDK v0.49):
//   order.paid                → one-time purchase (add-on pack)  → grant credits
//   subscription.created/active → plan activated               → set plan + grant
//   subscription.canceled/revoked → plan ended                 → revert to free
// (We deliberately do NOT grant on checkout.updated to avoid double-issuing
//  alongside order.paid.)

import { Polar } from "@polar-sh/sdk";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { grantCredits, MONTHLY_CREDITS } from "@/lib/quota";
import { ADDON, POLAR_PRODUCTS, type PlanId } from "@/lib/pricing";

const ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN;
const WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;
const SERVER: "sandbox" | "production" =
  process.env.POLAR_ENV === "production" ? "production" : "sandbox";

/** True only when BOTH token and webhook secret are present. */
export function polarEnabled(): boolean {
  return Boolean(ACCESS_TOKEN && WEBHOOK_SECRET);
}

let _polar: Polar | null = null;
function getPolar(): Polar {
  if (!ACCESS_TOKEN) throw new Error("POLAR_ACCESS_TOKEN missing");
  if (!_polar) {
    _polar = new Polar({ accessToken: ACCESS_TOKEN, server: SERVER });
  }
  return _polar;
}

export interface CheckoutInput {
  userId: string;
  email?: string | null;
  productKey: string; // "pro" | "business" | "addon"
}

/**
 * Create a Polar-hosted checkout session and return its redirect URL.
 * Returns null if Polar is not configured (caller should fall back to mock).
 */
export async function createCheckout(
  input: CheckoutInput
): Promise<string | null> {
  if (!polarEnabled()) return null;

  const cfg = POLAR_PRODUCTS[input.productKey];
  if (!cfg?.polarProductId) {
    throw new Error(`POLAR_PRODUCT_NOT_CONFIGURED:${input.productKey}`);
  }

  const polar = getPolar();
  const base =
    process.env.NEXT_PUBLIC_BASE_URL || "https://www.truelens.top";

  const checkout = await polar.checkouts.create({
    products: [cfg.polarProductId],
    successUrl: `${base}/pricing?polar=success&checkout_id={CHECKOUT_ID}`,
    customerEmail: input.email ?? undefined,
    // Copied onto the resulting order/subscription → read back in the webhook.
    metadata: { userId: input.userId, productKey: input.productKey },
  });

  return (checkout as unknown as { url?: string }).url ?? null;
}

/**
 * Verify a Polar webhook request. `rawBody` is the exact request text and
 * `headers` a plain {name: value} object (Polar uses the Standard Webhooks
 * spec: webhook-id / webhook-timestamp / webhook-signature).
 * Throws with status 403 on bad signature.
 */
export function verifyPolarWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): unknown {
  if (!WEBHOOK_SECRET) throw new Error("POLAR_WEBHOOK_SECRET missing");
  try {
    return validateEvent(rawBody, headers as Record<string, string>, WEBHOOK_SECRET);
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      const err = new Error("invalid_signature");
      (err as unknown as { status?: number }).status = 403;
      throw err;
    }
    throw e;
  }
}

// ── Entitlement application ────────────────────────────────────────────────

async function applyPlan(
  prisma: any,
  userId: string,
  plan: PlanId | "free"
): Promise<void> {
  if (plan === "free") {
    // Keep leftover credits; next monthly reset gives the free allowance.
    await prisma.user.update({ where: { id: userId }, data: { plan: "free" } });
    return;
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      credits: MONTHLY_CREDITS[plan] ?? 0,
      creditsResetAt: new Date(),
    },
  });
}

function resolveProductKey(data: any): string | undefined {
  const meta = data?.metadata ?? {};
  if (meta.productKey && POLAR_PRODUCTS[meta.productKey]) {
    return meta.productKey as string;
  }
  // Fallback: match by product/price id.
  const pid =
    data?.productId ||
    data?.productPriceId ||
    data?.product?.id ||
    data?.items?.[0]?.productId;
  if (pid) {
    for (const [key, cfg] of Object.entries(POLAR_PRODUCTS)) {
      if (cfg.polarProductId === pid) return key;
    }
  }
  return undefined;
}

/**
 * Apply a verified Polar event to the user's entitlements.
 * Idempotent: each event id is recorded in webhook_events so retries never
 * double-grant. We record BEFORE applying so a failure can't cause a
 * re-delivery to issue credits twice.
 */
export async function applyPolarEvent(
  prisma: any,
  payload: any
): Promise<void> {
  const type: string = payload?.type;
  const data: any = payload?.data ?? {};
  const meta: any = data?.metadata ?? {};
  const userId: string | undefined = meta.userId || data?.externalCustomerId;
  if (!userId) {
    console.warn("[polar] event without userId, skipped:", type, data?.id);
    return;
  }

  const eventId: string | undefined = data?.id || payload?.id;
  if (eventId) {
    // Mark processed first (unique constraint enforces idempotency).
    try {
      await prisma.webhookEvent.create({ data: { id: eventId, type } });
    } catch {
      return; // already processed → skip (no double grant)
    }
  }

  const productKey = resolveProductKey(data);

  try {
    if (type === "order.paid") {
      // One-time purchase (add-on pack).
      if (productKey === "addon") {
        await grantCredits(prisma, userId, ADDON.credits);
      } else if (productKey === "pro" || productKey === "business") {
        await applyPlan(prisma, userId, productKey);
      }
    } else if (type === "subscription.created" || type === "subscription.active") {
      if (productKey === "pro" || productKey === "business") {
        await applyPlan(prisma, userId, productKey);
      } else if (productKey === "addon") {
        await grantCredits(prisma, userId, ADDON.credits);
      }
    } else if (type === "subscription.canceled" || type === "subscription.revoked") {
      await applyPlan(prisma, userId, "free");
    }
    // subscription.updated / paused / past_due / reactivated / uncanceled:
    // intentionally ignored to avoid clobbering mid-month credit balances.
  } catch (e) {
    console.error("[polar] failed to apply event", type, eventId, e);
    throw e; // let the route return 500 so Polar retries the SAME event id
  }
}
