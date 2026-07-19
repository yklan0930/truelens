// Build / version info surfaced to the user in the footer so it's obvious
// when a deploy has actually landed (vs. a cached older version).

import packageJson from "../package.json";

const PKG_VERSION: string = packageJson.version || "0.0.0";

// On Vercel these are set automatically. Locally they're empty.
const VERCEL_SHA: string =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "";
const VERCEL_ENV: string = process.env.VERCEL_ENV || ""; // "production" | "preview" | ""

export interface VersionInfo {
  version: string; // e.g. "0.5.0"
  sha?: string; // 7-char git SHA, set on Vercel
  env?: string; // "production" | "preview"
  buildLabel: string; // e.g. "v0.5.0 · a1b2c3d"
}

export function getBuildInfo(): VersionInfo {
  const parts = [`v${PKG_VERSION}`];
  if (VERCEL_SHA) parts.push(VERCEL_SHA);
  if (VERCEL_ENV === "preview") parts.push("preview");
  return {
    version: PKG_VERSION,
    sha: VERCEL_SHA || undefined,
    env: VERCEL_ENV || undefined,
    buildLabel: parts.join(" \u00b7 "),
  };
}
