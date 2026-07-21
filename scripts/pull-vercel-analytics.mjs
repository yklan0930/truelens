// TrueLens — Vercel Analytics 数据拉取脚本（小数 · 数据分析）
// 用途：每日从 Vercel Web Analytics API 拉取访问量数据
// 运行：node scripts/pull-vercel-analytics.mjs
// 需要环境变量：VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env.local (if variables aren't set in environment)
dotenv.config({ path: ".env.local" });

// Secrets must come from environment or .env.local — never hardcoded
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "docs/data/analytics-report");

// ─── Helpers ─────────────────────────────────────────────────
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function vercelAPI(endpoint, params = {}) {
  const url = new URL(`https://api.vercel.com/v1/query/web-analytics/${endpoint}`);
  url.searchParams.set("teamId", TEAM_ID);
  url.searchParams.set("projectId", PROJECT_ID);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vercel API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  TrueLens Vercel 数据拉取 — ${today()}  ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  // 1. Count: total visitors & pageviews (last 7 days)
  console.log("📊 Fetching visit counts...");
  const count = await vercelAPI("visits/count");
  const totalVisitors = count.data?.visitors ?? 0;
  const totalPageviews = count.data?.pageviews ?? 0;
  console.log(`   Visitors: ${totalVisitors}, Pageviews: ${totalPageviews}`);

  // 2. Aggregate by day (last 7 days)
  console.log("📅 Fetching daily aggregates...");
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since = sevenDaysAgo.toISOString().split("T")[0];
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  let dailyData = [];
  try {
    const daily = await vercelAPI("visits/aggregate", {
      since,
      until,
      by: "day",
      limit: 14,
    });
    dailyData = daily.data || [];
    console.log(`   ${dailyData.length} days of data`);
  } catch (e) {
    console.log(`   (no daily aggregate data yet: ${e.message})`);
  }

  // 3. Top pages (last 7 days)
  console.log("📄 Fetching top pages...");
  let topPages = [];
  try {
    const pages = await vercelAPI("visits/aggregate", {
      since,
      until,
      by: "requestPath",
      limit: 10,
    });
    topPages = (pages.data || []).map((d) => ({
      path: d.requestPath || d.route || "/",
      pageviews: d.pageviews ?? 0,
      visitors: d.visitors ?? 0,
    }));
    console.log(`   ${topPages.length} pages`);
  } catch (e) {
    console.log(`   (no page data yet: ${e.message})`);
  }

  // 4. Top countries
  console.log("🌍 Fetching top countries...");
  let topCountries = [];
  try {
    const countries = await vercelAPI("visits/aggregate", {
      since,
      until,
      by: "country",
      limit: 10,
    });
    topCountries = (countries.data || []).map((d) => ({
      country: d.country || "Unknown",
      pageviews: d.pageviews ?? 0,
      visitors: d.visitors ?? 0,
    }));
    console.log(`   ${topCountries.length} countries`);
  } catch (e) {
    console.log(`   (no country data yet: ${e.message})`);
  }

  // 5. Top referrers
  console.log("🔗 Fetching top referrers...");
  let topReferrers = [];
  try {
    const refs = await vercelAPI("visits/aggregate", {
      since,
      until,
      by: "referrerHostname",
      limit: 10,
    });
    topReferrers = (refs.data || []).map((d) => ({
      referrer: d.referrerHostname || "Direct",
      pageviews: d.pageviews ?? 0,
      visitors: d.visitors ?? 0,
    }));
    console.log(`   ${topReferrers.length} referrers`);
  } catch (e) {
    console.log(`   (no referrer data yet: ${e.message})`);
  }

  // 6. Device breakdown
  console.log("📱 Fetching device breakdown...");
  let topDevices = [];
  try {
    const devices = await vercelAPI("visits/aggregate", {
      since,
      until,
      by: "deviceType",
      limit: 5,
    });
    topDevices = (devices.data || []).map((d) => ({
      device: d.deviceType || "Unknown",
      pageviews: d.pageviews ?? 0,
      visitors: d.visitors ?? 0,
    }));
    console.log(`   ${topDevices.length} device types`);
  } catch (e) {
    console.log(`   (no device data yet: ${e.message})`);
  }

  // ─── Build report ──────────────────────────────────────────
  const report = {
    _meta: {
      generatedAt: new Date().toISOString(),
      script: "scripts/pull-vercel-analytics.mjs",
      projectId: PROJECT_ID,
    },
    snapshot: {
      date: today(),
      period: { since, until },
      totalVisitors,
      totalPageviews,
      bounceRate: count.data?.bounceRate ?? null,
    },
    daily: dailyData.map((d) => ({
      date: d.timestamp ? d.timestamp.split("T")[0] : d.date,
      visitors: d.visitors ?? 0,
      pageviews: d.pageviews ?? 0,
    })),
    topPages,
    topCountries,
    topReferrers,
    topDevices,
  };

  // ─── Write output ──────────────────────────────────────────
  const dateStr = today();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // _latest.json
  const latestPath = path.join(OUT_DIR, "_latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n💾 Wrote _latest.json`);

  // YYYY-MM-DD.json
  const dailyPath = path.join(OUT_DIR, `${dateStr}.json`);
  fs.writeFileSync(dailyPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`💾 Wrote ${dateStr}.json`);

  // ─── Summary ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`📊 Today's Traffic (${dateStr})`);
  console.log(`   Visitors:  ${totalVisitors}`);
  console.log(`   Pageviews: ${totalPageviews}`);
  console.log(`   Pages:     ${topPages.length} tracked`);
  console.log(`   Countries: ${topCountries.length}`);
  console.log(`   Referrers: ${topReferrers.length}`);
  console.log(`═══════════════════════════════════════════\n`);

  return report;
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message);
  process.exit(1);
});
