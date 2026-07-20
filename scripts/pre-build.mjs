// Pre-build step: writes git SHA into source and ensures C2PA native binary.
//
// This script runs BEFORE `next build` so that:
// 1. lib/generated-sha.ts contains the 7-char commit SHA (baked into the bundle,
//    visible in the footer — works even when VERCEL_GIT_COMMIT_SHA is not set,
//    e.g. CLI deployments or when Vercel's Git integration misses it).
// 2. The @contentauth/c2pa-node native .node binary is present (downloaded from
//    GitHub Releases if missing).
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

// ── 2. Ensure C2PA native binary ───────────────────────────────────
try {
  // Use file:// URL for cross-platform ESM compatibility (Windows needs it)
  const c2paScriptUrl = new URL("ensure-c2pa-binary.mjs", import.meta.url);
  await import(c2paScriptUrl);
} catch (e) {
  console.warn(`[pre-build] C2PA ensure script error (non-fatal): ${e?.message || e}`);
}
