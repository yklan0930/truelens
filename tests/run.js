// TrueLens QA Test Runner
// Reads tests/manifest.json, calls truelens.top detection API for each image,
// compares results with expected labels, generates accuracy report.
//
// Usage:
//   node tests/run.js                          (production API)
//   API_URL=http://localhost:3000 node tests/run.js  (local dev server)
//
// Expected: images are in tests/images/ - symlinked or copied.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL || "https://truelens.top";
const MANIFEST_PATH = join(__dirname, "manifest.json");
const IMAGES_DIR = join(__dirname, "images");
const REPORTS_DIR = join(__dirname, "reports");
const BATCH_DELAY_MS = 6000; // 6s between images to avoid rate limits

interface TestCase {
  file: string;        // filename in tests/images/
  expected: "ai" | "real" | "uncertain";
  category?: string;   // e.g. "sora", "midjourney", "iphone", "dslr"
  note?: string;
}

interface Manifest {
  version: number;
  description: string;
  tests: TestCase[];
}

interface ApiResult {
  aiProbability: number;
  verdict: "likely_ai" | "likely_real" | "uncertain";
  confidence: number;
  engines?: Record<string, unknown>;
}

interface TestRecord {
  file: string;
  expected: string;
  actual: string;
  aiProb: number;
  correct: boolean;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testImage(filePath: string, fileName: string): Promise<ApiResult> {
  // Read file as buffer
  const buffer = readFileSync(filePath);
  const blob = new Blob([buffer], { type: "image/png" });
  const form = new FormData();
  form.append("image", blob, fileName);

  const res = await fetch(`${API_URL}/api/detect`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data;
}

async function main() {
  // 1. Read manifest
  if (!existsSync(MANIFEST_PATH)) {
    console.error("ERROR: manifest.json not found at", MANIFEST_PATH);
    process.exit(1);
  }
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  console.log(`\n📋 Manifest: ${manifest.description} (v${manifest.version})`);
  console.log(`   ${manifest.tests.length} test cases\n`);

  // 2. Run tests
  const records: TestRecord[] = [];
  let passed = 0;
  let failed = 0;
  let errors = 0;

  for (let i = 0; i < manifest.tests.length; i++) {
    const tc = manifest.tests[i];
    const filePath = join(IMAGES_DIR, tc.file);
    const label = `[${i + 1}/${manifest.tests.length}] ${tc.file}`;

    if (!existsSync(filePath)) {
      console.log(`   ⚠️  ${label} — FILE NOT FOUND, skipping`);
      records.push({ file: tc.file, expected: tc.expected, actual: "skip", aiProb: 0, correct: false, error: "File not found" });
      continue;
    }

    process.stdout.write(`   🔍 ${label}`);
    try {
      const result = await testImage(filePath, tc.file);
      const actual = result.verdict === "likely_ai" ? "ai" : result.verdict === "likely_real" ? "real" : "uncertain";
      const correct = actual === tc.expected;
      const mark = correct ? "✅" : "❌";

      records.push({ file: tc.file, expected: tc.expected, actual, aiProb: result.aiProbability, correct });

      if (correct) {
        passed++;
        process.stdout.write(` → ${mark} AI味=${result.aiProbability}% (expect ${tc.expected})\n`);
      } else {
        failed++;
        process.stdout.write(` → ${mark} AI味=${result.aiProbability}% got=${actual} expect=${tc.expected}\n`);
      }
    } catch (err: unknown) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      records.push({ file: tc.file, expected: tc.expected, actual: "error", aiProb: 0, correct: false, error: msg });
      process.stdout.write(` → 💥 ERROR: ${msg}\n`);
    }

    // Delay to avoid rate limits (not needed for last item)
    if (i < manifest.tests.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // 3. Calculate metrics
  const total = passed + failed;
  const accuracy = total > 0 ? ((passed / total) * 100).toFixed(1) : "N/A";

  // Per-class precision/recall/F1
  const classes = ["ai", "real"];
  const metrics: Record<string, { tp: number; fp: number; fn: number }> = {};
  for (const cls of classes) {
    metrics[cls] = { tp: 0, fp: 0, fn: 0 };
  }

  for (const r of records) {
    if (r.error) continue;
    if (r.expected === "ai") {
      if (r.actual === "ai") metrics["ai"].tp++;
      else metrics["ai"].fn++;
    } else if (r.expected === "real") {
      if (r.actual === "real") metrics["real"].tp++;
      else metrics["real"].fp++;
    }
  }

  function calcPrecision(m: { tp: number; fp: number }): string {
    const v = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
    return (v * 100).toFixed(1) + "%";
  }
  function calcRecall(m: { tp: number; fn: number }): string {
    const v = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0;
    return (v * 100).toFixed(1) + "%";
  }
  function calcF1(m: { tp: number; fp: number; fn: number }): string {
    const p = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
    const r = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0;
    const f1 = p + r > 0 ? 2 * p * r / (p + r) : 0;
    return (f1 * 100).toFixed(1) + "%";
  }

  // 4. Generate report
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  let report = `# TrueLens QA Report — ${date}\n\n`;
  report += `**Run at**: ${timestamp}\n`;
  report += `**API**: ${API_URL}\n`;
  report += `**Tests**: ${total} · **Passed**: ${passed} · **Failed**: ${failed} · **Errors**: ${errors}\n`;
  report += `**Accuracy**: ${accuracy}\n\n`;

  report += `## Metrics by Class\n\n`;
  report += `| Class | Precision | Recall | F1 Score |\n`;
  report += `|-------|-----------|--------|----------|\n`;
  for (const cls of classes) {
    report += `| ${cls} | ${calcPrecision(metrics[cls])} | ${calcRecall(metrics[cls])} | ${calcF1(metrics[cls])} |\n`;
  }
  report += `\n`;

  report += `## Per-Test Results\n\n`;
  report += `| # | File | Expected | Actual | AI味 | Status |\n`;
  report += `|---|------|----------|--------|------|--------|\n`;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const status = r.error ? `💥 ${r.error}` : r.correct ? "✅" : "❌";
    report += `| ${i + 1} | ${r.file} | ${r.expected} | ${r.actual} | ${r.aiProb}% | ${status} |\n`;
  }

  report += `\n## Misclassifications\n\n`;
  for (const r of records) {
    if (!r.correct && !r.error) {
      report += `- ❌ **${r.file}**: expected=${r.expected}, got=${r.actual}, AI味=${r.aiProb}%\n`;
    }
  }

  // Write report
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `${date}.md`);
  writeFileSync(reportPath, report, "utf-8");

  // Summary to console
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📊 QA Report Summary — ${date}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`   Total:   ${total}`);
  console.log(`   Passed:  ${passed} ✅`);
  console.log(`   Failed:  ${failed} ${failed > 0 ? "❌" : "✅"}`);
  console.log(`   Errors:  ${errors}`);
  console.log(`   Acc:     ${accuracy}`);
  console.log(`\n   AI Precision: ${calcPrecision(metrics["ai"])}`);
  console.log(`   AI Recall:    ${calcRecall(metrics["ai"])}`);
  console.log(`   AI F1:        ${calcF1(metrics["ai"])}`);
  console.log(`   Real Precision: ${calcPrecision(metrics["real"])}`);
  console.log(`   Real Recall:    ${calcRecall(metrics["real"])}`);
  console.log(`   Real F1:        ${calcF1(metrics["real"])}`);
  console.log(`\n📄 Report saved: tests/reports/${date}.md`);

  // Exit with error code if any failures
  if (failed > 0 || errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
