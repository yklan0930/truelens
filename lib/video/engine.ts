// Resolves which video engine to use. Defaults to the local mock when
// Sightengine credentials are absent, so the feature is demoable out of the
// box. Set SIGHTENGINE_API_USER + SIGHTENGINE_API_SECRET to switch to the
// production path. Engine id is also persisted on each VideoJob row.

import { isSightengineConfigured } from "./sightengine";

export type VideoEngineId = "mock" | "sightengine";

export function resolveVideoEngine(): VideoEngineId {
  return isSightengineConfigured() ? "sightengine" : "mock";
}
