// Pre-build step: writes git SHA into source.
//
// This script runs BEFORE `next build` so that lib/generated-sha.ts contains
// the 7-char commit SHA (baked into the bundle, visible in the footer — works
// even when VERCEL_GIT_COMMIT_SHA is not set, e.g. CLI deployments or when
// Vercel's Git integration misses it).
//
// C2PA verification now uses @contentauth/c2pa-wasm (pure WASM, no native
// binary), so no build-time binary download is needed.
//
// Usage:  node scripts/pre-build.mjs
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── 1. Write git SHA ──────────────────────────────────────────────
let sha = "";
try {
  sha = execSync("git rev-parse --short HEAD", {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
} catch {
  // Not a git repo or no commits — leave empty, version.ts falls back to env var
}
const shaFileContent =
  `// Generated at build time by scripts/pre-build.mjs — DO NOT EDIT MANUALLY.\n` +
  `// Contains the 7-char git SHA of the commit being deployed.\n` +
  `export const BUILD_SHA = "${sha}";\n`;
writeFileSync(path.join(ROOT, "lib", "generated-sha.ts"), shaFileContent, "utf-8");
console.log(`[pre-build] BUILD_SHA = "${sha || "(empty)"}"`);

// ── 2. Pre-flight checks (non-fatal) ───────────────────────────────
// C2PA now uses @contentauth/c2pa-wasm (pure WASM, no native binary),
// so no build-time binary download is needed. Nothing to do here.
