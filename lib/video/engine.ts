// Resolves which video engine to use, based on what's configured and the
// user's plan. Engine selection is a *capability*, not a hard requirement:
// if the user is not paid, we never pick a paid engine even if it's
// configured.
//
// Engines (in order of preference for paid users):
//   - replicate: Replicate.com cloversid099/deepfake (best quality for deepfakes,
//     costs ~$0.089/run, $10/mo free credit)
//   - sightengine: Sightengine genai model (paid tier only)
//
// Engines for free users (fallback):
//   - frames: client-side frame extraction + image API (always available, free)
//   - mock: simulated detection (last resort, for demos)

import { isSightengineConfigured } from "./sightengine";

export type VideoEngineId = "mock" | "frames" | "sightengine" | "replicate";

export function isReplicateConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

/**
 * Pick the right engine for a given user (or anonymous).
 * Paid/admin users get the best configured paid engine.
 * Free/anonymous users get the local "frames" engine.
 */
export function resolveVideoEngine(opts: {
  isAuthenticated: boolean;
  isAdmin: boolean;
  plan: string;
}): VideoEngineId {
  const canUsePaid = opts.isAdmin || (opts.isAuthenticated && opts.plan !== "free");

  if (canUsePaid) {
    if (isReplicateConfigured()) return "replicate";
    if (isSightengineConfigured()) return "sightengine";
  }
  // Free fallback path: client-side frame extraction using our image API.
  // No engine needed server-side; the client does the work directly.
  return "frames";
}
