// TrueLens 每日反馈汇总 · 第一步：从生产库拉取新反馈 → docs/feedback-reports/_latest.json
// 用 Node + pg（生产库直连，已验证可用）。DATABASE_URL 优先读环境变量，否则从 .env.local 解析。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { Client } from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportsDir = path.join(root, "docs", "feedback-reports");
if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

// ── 解析 DATABASE_URL ──
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  try {
    const envRaw = readFileSync(path.join(root, ".env.local"), "utf8");
    const m = envRaw.match(/DATABASE_URL="([^"]+)"/);
    if (m) DATABASE_URL = m[1];
  } catch {}
}
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found (.env.local or env)");
  process.exit(1);
}

// ── 计算窗口起点（上次成功生成时间；首次默认 24h 前）──
const statePath = path.join(reportsDir, ".last_run.txt");
const argSince = process.argv.find((a) => a.startsWith("--since="));
let since;
if (argSince) {
  since = new Date(argSince.split("=")[1]);
} else if (existsSync(statePath)) {
  const t = new Date(readFileSync(statePath, "utf8").trim());
  since = isNaN(t) ? new Date(Date.now() - 24 * 3600 * 1000) : t;
} else {
  since = new Date(Date.now() - 24 * 3600 * 1000);
}

const client = new Client({ connectionString: DATABASE_URL });
try {
  await client.connect();
  const res = await client.query(
    `SELECT id, type, rating, message, "resultContext" AS resultContext,
            locale, "userId", email, "createdAt"
     FROM feedback
     WHERE "createdAt" > $1
     ORDER BY "createdAt" DESC`,
    [since]
  );
  const items = res.rows.map((r) => ({
    id: r.id,
    type: r.type,
    rating: r.rating,
    message: r.message,
    resultContext: r.resultContext ?? r.resultcontext ?? null,
    locale: r.locale,
    userId: r.userId,
    email: r.email,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));
  writeFileSync(
    path.join(reportsDir, "_latest.json"),
    JSON.stringify(
      {
        since: since.toISOString(),
        generatedAt: new Date().toISOString(),
        count: items.length,
        items,
      },
      null,
      2
    )
  );
  console.log(
    `OK queried ${items.length} feedback items since ${since.toISOString()}`
  );
} catch (e) {
  console.error("QUERY ERROR:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
