// Ensure the native @contentauth/c2pa-node binary (index.node) is present in
// node_modules before `next build`.
//
// The package's own `postinstall` downloads this prebuilt binary from GitHub
// Releases, but on some CI hosts (notably Vercel) that step silently fails —
// the download is skipped and C2PA verification then degrades to a no-op at
// runtime ("Cannot find module './index.node'"). This script is a reliable
// fallback that (re)downloads the correct prebuilt binary for the current
// platform and extracts `index.node` into the package's `dist/` folder.
//
// It is intentionally NON-FATAL: if anything goes wrong we just log and let the
// build continue — C2PA is a prototype verifier and the app degrades gracefully.
import { execFileSync } from "node:child_process";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, stat, copyFile, readdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const REPO = "https://github.com/contentauth/c2pa-js";
const PKG = "@contentauth/c2pa-node";

function platformTriple() {
  const arch = os.arch();
  const plat = os.platform();
  if (arch === "x64" && plat === "linux") return "x86_64-unknown-linux-gnu";
  if (arch === "arm64" && plat === "linux") return "aarch64-unknown-linux-gnu";
  if (arch === "x64" && plat === "darwin") return "x86_64-apple-darwin";
  if (arch === "arm64" && plat === "darwin") return "aarch64-apple-darwin";
  if (plat === "win32") return "x86_64-pc-windows-msvc";
  return null;
}

async function readVersion() {
  try {
    const raw = await import("node:fs/promises").then((m) =>
      m.readFile(path.join(ROOT, "node_modules", PKG, "package.json"), "utf8")
    );
    return JSON.parse(raw).version;
  } catch {
    return "0.6.3";
  }
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findFile(dir, name) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = await findFile(p, name);
      if (r) return r;
    } else if (e.name === name) {
      return p;
    }
  }
  return null;
}

async function extractZip(zipPath, outDir) {
  // Preferred: system `unzip` (present on Vercel Linux / macOS).
  try {
    execFileSync("unzip", ["-o", zipPath, "-d", outDir], { stdio: "ignore" });
    return true;
  } catch {
    // Fallback: the `unzipper` module (a dep of c2pa-node) if resolvable.
    try {
      const { default: unzipper } = await import("unzipper");
      await new Promise((resolve, reject) => {
        let settled = false;
        const stream = createReadStream(zipPath).pipe(unzipper.Parse());
        stream.on("entry", (entry) => {
          if (entry.path.endsWith("index.node")) {
            const out = createWriteStream(path.join(outDir, "index.node"));
            entry.pipe(out);
            out.on("finish", () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            });
          } else {
            entry.autodrain();
          }
        });
        stream.on("close", () => {
          if (!settled) resolve();
        });
        stream.on("error", reject);
      });
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  const version = await readVersion();
  const triple = platformTriple();
  if (!triple) {
    console.warn(
      "[c2pa] No prebuilt binary for this platform; skipping (C2PA will degrade gracefully)."
    );
    return;
  }

  const destDir = path.join(ROOT, "node_modules", PKG, "dist");
  const dest = path.join(destDir, "index.node");

  // Fast path: already present (local dev / warm Vercel cache).
  if (await exists(dest)) {
    console.log(`[c2pa] Binary already present at ${dest}; skipping download.`);
    return;
  }

  const tag = `${PKG}@${version}`;
  const fileName = `c2pa-node_${triple}-v${version}.zip`;
  const url = `${REPO}/releases/download/${encodeURIComponent(tag)}/${fileName}`;

  console.log(`[c2pa] Downloading prebuilt binary: ${url}`);
  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url);
      if (res.ok) break;
      console.error(`[c2pa] attempt ${attempt}: HTTP ${res.status}`);
    } catch (e) {
      console.error(`[c2pa] attempt ${attempt}: ${e?.message || e}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  if (!res || !res.ok) {
    console.error("[c2pa] Download failed; C2PA verification will be unavailable. Build continues.");
    return;
  }

  const tmpZip = path.join(os.tmpdir(), fileName);
  await mkdir(destDir, { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpZip));

  const extractDir = path.join(os.tmpdir(), `c2pa-extract-${Date.now()}`);
  await mkdir(extractDir, { recursive: true });
  const ok = await extractZip(tmpZip, extractDir);
  if (!ok) {
    console.error("[c2pa] Extraction failed; C2PA unavailable. Build continues.");
    return;
  }

  const found = await findFile(extractDir, "index.node");
  if (!found) {
    console.error("[c2pa] index.node not found in archive; C2PA unavailable. Build continues.");
    return;
  }
  await copyFile(found, dest);
  console.log(`[c2pa] Binary installed at ${dest}`);
}

main().catch((e) => {
  console.error(`[c2pa] Ensure-binary step failed (non-fatal): ${e?.message || e}`);
});
