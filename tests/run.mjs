// TrueLens QA Test Runner — plain JS ESM
// Uses curl via child_process for HTTP calls (handles proxy automatically)
// Usage: node tests/run.mjs
//   API_URL=http://localhost:3000 node tests/run.mjs  (local dev)
//   MAX_TESTS=3 node tests/run.mjs                    (subset)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL || "https://truelens.top";
const MANIFEST_PATH = join(__dirname, "manifest.json");
const IMAGES_DIR = join(__dirname, "images");
const REPORTS_DIR = join(__dirname, "reports");
const BATCH_DELAY_MS = 6000;
const MAX_TESTS = parseInt(process.env.MAX_TESTS || "999", 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Use curl for HTTP requests (handles proxy automatically via HTTPS_PROXY)
import { execSync } from "node:child_process";
function curlPost(filePath, fileName, url) {
  const mimeType = fileName.endsWith(".png") ? "image/png" : "image/jpeg";
  // Use curl -F to upload multipart form data
  // Normalize path to forward slashes for Git Bash curl
  const normPath = filePath.replace(/\\/g, "/");
  const cmd = `curl -sL -F "image=@${normPath};type=${mimeType};filename=${fileName}" "${url}/api/detect"`;
  try {
    const stdout = execSync(cmd, { timeout: 40000, encoding: "utf-8", maxBuffer: 2 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (err) {
    if (err.stderr) throw new Error(`curl: ${err.stderr.toString().slice(0, 200)}`);
    // Try to parse stdout in case it has partial JSON
    if (err.stdout) {
      try { return JSON.parse(err.stdout.toString()); } catch {}
    }
    throw new Error(`curl failed: ${err.message}`);
  }
}

async function testImage(filePath, fileName) {
  const result = curlPost(filePath, fileName, API_URL);
  if (result.error) throw new Error(`API error: ${result.error}`);
  // API wraps detection result in .result
  const detection = result.result;
  if (!detection) throw new Error(`Unexpected API response: missing .result`);
  return detection;
}

async function main() {
  // 1. Read manifest
  if (!existsSync(MANIFEST_PATH)) {
    console.error("ERROR: manifest.json not found at", MANIFEST_PATH);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const tests = manifest.tests.slice(0, MAX_TESTS);
  console.log(`\nManifest: ${manifest.description} (v${manifest.version})`);
  console.log(`  ${tests.length} tests\n`);

  // 2. Run tests sequentially
  const records = [];
  let passed = 0;
  let failed = 0;
  let errors = 0;

  for (let i = 0; i < tests.length; i++) {
    const tc = tests[i];
    const filePath = join(IMAGES_DIR, tc.file);
    const label = `${tc.file}`;

    if (!existsSync(filePath)) {
      console.log(`  SKIP ${label}`);
      records.push({ file: tc.file, expected: tc.expected, actual: "skip", aiProb: 0, correct: false, error: "File not found" });
      continue;
    }

    process.stdout.write(`  ${label}`);
    try {
      const result = await testImage(filePath, tc.file);
      const actual = result.verdict === "likely_ai" ? "ai" : result.verdict === "likely_real" ? "real" : "uncertain";
      const correct = actual === tc.expected;
      if (correct) passed++;
      else failed++;
      records.push({ file: tc.file, expected: tc.expected, actual, aiProb: result.aiProbability, correct, error: null });
      const mark = correct ? "OK" : "FAIL";
      console.log(` ${mark} aiProb=${result.aiProbability}% got=${actual} expect=${tc.expected}`);
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      records.push({ file: tc.file, expected: tc.expected, actual: "error", aiProb: 0, correct: false, error: msg });
      console.log(` ERROR: ${msg}`);
    }

    if (i < tests.length - 1) await sleep(BATCH_DELAY_MS);
  }

  // 3. Metrics
  const total = passed + failed;
  const accuracy = total > 0 ? ((passed / total) * 100).toFixed(1) : "N/A";
  const metrics = {};
  for (const cls of ["ai", "real"]) {
    metrics[cls] = { tp: 0, fp: 0, fn: 0 };
  }
  for (const r of records) {
    if (r.error) continue;
    if (r.expected === "ai") {
      if (r.actual === "ai") metrics.ai.tp++;
      else metrics.ai.fn++;
    } else if (r.expected === "real") {
      if (r.actual === "real") metrics.real.tp++;
      else metrics.real.fp++;
    }
  }

  function pct(m, key) {
    const v = m.tp + (key === "fp" ? m.fp : m.fn);
    return v > 0 ? ((m.tp / v) * 100).toFixed(1) : "100.0";
  }
  function f1(m) {
    const prec = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 1;
    const rec = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 1;
    return (prec + rec > 0 ? ((2 * prec * rec) / (prec + rec)) * 100 : 100).toFixed(1);
  }

  // 4. Report
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);

  let report = `# TrueLens QA Report — ${date}\n\n`;
  report += `Run at: ${timestamp}\nAPI: ${API_URL}\n`;
  report += `Tests: ${total} | Passed: ${passed} | Failed: ${failed} | Errors: ${errors}\n`;
  report += `Accuracy: ${accuracy}\n\n`;
  report += `## Metrics\n\n| Class | Precision | Recall | F1 |\n|---|---|---|---|\n`;
  for (const cls of ["ai", "real"]) {
    const m = metrics[cls];
    report += `| ${cls} | ${pct(m, "fp")}% | ${pct(m, "fn")}% | ${f1(m)}% |\n`;
  }
  report += `\n## Per-Test\n\n| File | Expect | Actual | AI味 | Status |\n|---|---|---|---|---|\n`;
  for (const r of records) {
    const s = r.error ? `ERROR ${r.error}` : r.correct ? "OK" : "FAIL";
    report += `| ${r.file} | ${r.expected} | ${r.actual} | ${r.aiProb}% | ${s} |\n`;
  }

  const mis = records.filter((r) => !r.correct && !r.error);
  if (mis.length > 0) {
    report += `\n## Misclassifications\n\n`;
    for (const r of mis) {
      report += `- ${r.file}: expected=${r.expected}, got=${r.actual}, AI味=${r.aiProb}%\n`;
    }
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, `${date}.md`), report, "utf-8");

  // 5. Console summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`QA Report — ${date}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  Total: ${total} | Pass: ${passed} | Fail: ${failed} | Err: ${errors}`);
  console.log(`  Acc: ${accuracy} | AI F1: ${f1(metrics.ai)}% | Real F1: ${f1(metrics.real)}%`);
  console.log(`  Report: tests/reports/${date}.md`);

  if (failed > 0 || errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
