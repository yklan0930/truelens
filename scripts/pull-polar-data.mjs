// TrueLens — Polar.sh 数据拉取脚本（小数 · 数据分析）
// 用途：每日从 Polar API 拉取 orders + subscriptions，统计收入/订单/用户关键指标
// 运行：node scripts/pull-polar-data.mjs
// 输出：docs/data/polar-report/_latest.json + docs/data/polar-report/YYYY-MM-DD.json

import dotenv from "dotenv";
// Load .env.local specifically (dotenv default loads .env)
dotenv.config({ path: ".env.local" });
import { Polar } from "@polar-sh/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── Config ──────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "docs/data/polar-report");

const ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN;
const WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;
const POLAR_ENV = process.env.POLAR_ENV || "sandbox";

// ─── Helpers ─────────────────────────────────────────────────-
function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtCurrency(cents, currency = "usd") {
  // Polar amounts are in cents
  return (cents / 100).toFixed(2);
}

function safeNum(n) {
  return typeof n === "number" ? n : 0;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  TrueLens Polar 数据拉取 — ${today()}  ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  // 1. Validate config
  if (!ACCESS_TOKEN || !WEBHOOK_SECRET) {
    console.error("❌ POLAR_ACCESS_TOKEN or POLAR_WEBHOOK_SECRET not set in .env.local");
    process.exit(1);
  }

  console.log(`📡 Polar Env: ${POLAR_ENV === "production" ? "PRODUCTION ✅" : "sandbox ⚠️"}`);
  console.log(`📡 Token: ${ACCESS_TOKEN.slice(0, 12)}...`);

  // 2. Init Polar client
  const polar = new Polar({
    accessToken: ACCESS_TOKEN,
    server: POLAR_ENV === "production" ? "production" : "sandbox",
  });

  // 3. Fetch ALL orders (paginated)
  console.log("\n📦 Fetching orders...");
  const allOrders = [];
  let page = 1;
  const PAGE_SIZE = 100;
  let hasMore = true;

  while (hasMore) {
    const result = await polar.orders.list({
      page,
      limit: PAGE_SIZE,
      sorting: ["-created_at"],
    });
    const items = result.result?.items || [];
    allOrders.push(...items);
    console.log(`   Page ${page}: ${items.length} orders (total: ${allOrders.length})`);

    // Check if there are more pages
    const pagination = result.result?.pagination;
    hasMore = pagination && page < (pagination.maxPage || 0);
    page++;
  }

  console.log(`   ✅ Total orders fetched: ${allOrders.length}`);

  // 4. Fetch ALL subscriptions (paginated)
  console.log("\n🔄 Fetching subscriptions...");
  const allSubs = [];
  page = 1;
  hasMore = true;

  while (hasMore) {
    const result = await polar.subscriptions.list({
      page,
      limit: PAGE_SIZE,
      sorting: ["-started_at"],
    });
    const items = result.result?.items || [];
    allSubs.push(...items);
    console.log(`   Page ${page}: ${items.length} subscriptions (total: ${allSubs.length})`);

    const pagination = result.result?.pagination;
    hasMore = pagination && page < (pagination.maxPage || 0);
    page++;
  }

  console.log(`   ✅ Total subscriptions fetched: ${allSubs.length}`);

  // 5. Compute statistics
  console.log("\n📊 Computing statistics...");

  // Orders analysis
  const paidOrders = allOrders.filter((o) => o.status === "paid");
  const refundedOrders = allOrders.filter(
    (o) => o.status === "refunded" || o.status === "partially_refunded"
  );
  const pendingOrders = allOrders.filter((o) => o.status === "pending");
  const voidOrders = allOrders.filter((o) => o.status === "void");

  const totalRevenueCents = paidOrders.reduce(
    (sum, o) => sum + safeNum(o.netAmount),
    0
  );
  const totalTaxCents = paidOrders.reduce(
    (sum, o) => sum + safeNum(o.taxAmount),
    0
  );
  const totalGrossCents = paidOrders.reduce(
    (sum, o) => sum + safeNum(o.amount),
    0
  );

  // Refund amounts (if we have refund info in the order)
  const totalRefundedCents = refundedOrders.reduce(
    (sum, o) => sum + safeNum(o.amount),
    0
  );

  // Order breakdown by billing reason
  const oneTimeOrders = paidOrders.filter(
    (o) => o.billingReason === "purchase"
  );
  const subscriptionOrders = paidOrders.filter(
    (o) =>
      o.billingReason === "subscription_create" ||
      o.billingReason === "subscription_cycle" ||
      o.billingReason === "subscription_update"
  );

  // Subscription analysis
  const activeSubs = allSubs.filter((s) => s.status === "active");
  const inactiveSubs = allSubs.filter((s) => s.status === "inactive");
  const canceledSubs = allSubs.filter(
    (s) => s.status === "canceled" || s.status === "revoked"
  );
  const pastDueSubs = allSubs.filter((s) => s.status === "past_due");

  // MRR estimate: sum of active subscription amounts (monthly)
  // Polar amounts are in cents; we assume monthly billing
  const estimatedMRR = activeSubs.reduce((sum, s) => {
    const amt = safeNum(s.amount);
    // If amount is 0 (free plan), skip
    return sum + (amt > 0 ? amt : 0);
  }, 0);

  // Unique customers
  const uniqueCustomerIds = new Set(paidOrders.map((o) => o.customer?.id).filter(Boolean));
  const uniqueSubCustomerIds = new Set(activeSubs.map((s) => s.customer?.id).filter(Boolean));
  const allCustomerIds = new Set([...uniqueCustomerIds, ...uniqueSubCustomerIds]);

  // ─── Build report object ────────────────────────────────
  const report = {
    _meta: {
      generatedAt: new Date().toISOString(),
      script: "scripts/pull-polar-data.mjs",
      polarEnv: POLAR_ENV,
    },
    snapshot: {
      date: today(),
      totalOrders: allOrders.length,
      paidOrders: paidOrders.length,
      refundedOrders: refundedOrders.length,
      pendingOrders: pendingOrders.length,
      voidOrders: voidOrders.length,
      totalSubscriptions: allSubs.length,
      activeSubscriptions: activeSubs.length,
      canceledSubscriptions: canceledSubs.length,
      pastDueSubscriptions: pastDueSubs.length,
      uniqueCustomers: allCustomerIds.size,
    },
    revenue: {
      grossUSD: fmtCurrency(totalGrossCents),
      netUSD: fmtCurrency(totalRevenueCents),
      taxUSD: fmtCurrency(totalTaxCents),
      refundedUSD: fmtCurrency(totalRefundedCents),
      estimatedMonthlyMRR_USD: fmtCurrency(estimatedMRR),
    },
    breakdown: {
      oneTimePurchases: oneTimeOrders.length,
      subscriptionPayments: subscriptionOrders.length,
      oneTimeRevenueUSD: fmtCurrency(
        oneTimeOrders.reduce((s, o) => s + safeNum(o.netAmount), 0)
      ),
      subscriptionRevenueUSD: fmtCurrency(
        subscriptionOrders.reduce((s, o) => s + safeNum(o.netAmount), 0)
      ),
    },
    recentOrders: paidOrders.slice(0, 10).map((o) => ({
      id: o.id,
      status: o.status,
      amountUSD: fmtCurrency(safeNum(o.amount)),
      netUSD: fmtCurrency(safeNum(o.netAmount)),
      currency: o.currency,
      billingReason: o.billingReason,
      customerId: o.customer?.id,
      customerEmail: o.customer?.email,
      productName: o.product?.name,
      createdAt: o.createdAt,
    })),
    recentSubscriptions: activeSubs.slice(0, 10).map((s) => ({
      id: s.id,
      status: s.status,
      amountUSD: fmtCurrency(safeNum(s.amount)),
      currency: s.currency,
      customerId: s.customer?.id,
      customerEmail: s.customer?.email,
      productName: s.product?.name,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      startedAt: s.startedAt,
    })),
  };

  // 6. Write output
  const dateStr = today();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // _latest.json (overwrite every run)
  const latestPath = path.join(OUT_DIR, "_latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n💾 Wrote _latest.json (${Math.round(fs.statSync(latestPath).size / 1024)} KB)`);

  // YYYY-MM-DD.json (daily archive)
  const dailyPath = path.join(OUT_DIR, `${dateStr}.json`);
  fs.writeFileSync(dailyPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`💾 Wrote ${dateStr}.json (${Math.round(fs.statSync(dailyPath).size / 1024)} KB)`);

  // 7. Summary
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`📊 Today's Snapshot (${dateStr})`);
  console.log(`   Orders:      ${paidOrders.length} paid / ${allOrders.length} total`);
  console.log(`   Subs:        ${activeSubs.length} active / ${allSubs.length} total`);
  console.log(`   Customers:   ${allCustomerIds.size} unique`);
  console.log(`   Revenue:     $${report.revenue.netUSD} net / $${report.revenue.grossUSD} gross`);
  console.log(`   Est. MRR:    $${report.revenue.estimatedMonthlyMRR_USD}/mo`);
  console.log(`   Refunds:     $${report.revenue.refundedUSD}`);
  console.log(`═══════════════════════════════════════════\n`);

  return report;
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message);
  process.exit(1);
});
