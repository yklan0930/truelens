// C2PA / Content Credentials provenance verifier.
//
// Uses the official `@contentauth/c2pa-node` (v0.6.3, the v2 successor of the
// deprecated `c2pa-node`). That package ships a NATIVE Rust addon (.node) which is
// downloaded from GitHub Releases at `npm install` time. Environments that cannot
// fetch that binary (or where it is simply absent) must degrade gracefully — this
// module is written to do exactly that:
//   - the native lib is loaded via `require()` (typed as `any`) so a missing
//     `@contentauth/c2pa-types` declaration never breaks the build;
//   - if `require` or `Reader.fromAsset` throws, we return `available:false`
//     instead of crashing the analysis pipeline.
//
// NOTE: this is a PROTOTYPE verifier. It reads the manifest and reports the
// signer / assertions / validation status, but full cryptographic trust validation
// depends on the native lib being present at runtime (user machine / Vercel).
import type { ServerLocale } from "@/lib/i18n/server";

export interface C2paResult {
  modelId: "c2pa";
  /** True if a C2PA manifest store was found in the asset. */
  found: boolean;
  /** True if the native c2pa lib could be loaded in this environment. */
  available: boolean;
  /** Manifest signature validation status (e.g. "valid" | "invalid"). */
  validationStatus?: string;
  /** Convenience boolean derived from validationStatus. */
  valid?: boolean;
  /** True if validation failed / manifest looks tampered. */
  isTampered?: boolean;
  /** Certificate subject (who/what signed the credential). */
  signer?: string;
  /** Certificate issuer. */
  issuer?: string;
  /** Creation time from the claim. */
  created?: string;
  /** Detected software agent (generator) name, if any. */
  softwareAgent?: string;
  /** Heuristic: does the credential declare AI generation? */
  aiGenerated?: boolean;
  /** List of assertion labels present in the active manifest. */
  assertions?: string[];
  /** Whether the manifest was embedded in the file vs. remote. */
  embedded?: boolean;
  /** Remote manifest URL, if applicable. */
  remoteUrl?: string;
  /** Error detail when available===false or parsing failed. */
  error?: string;
  /** Full manifest store (truncated) for debugging / UI transparency. */
  raw?: Record<string, unknown>;
}

// Loose handle to the native module — we never rely on its typed surface.
type AnyModule = Record<string, any>;

let c2paMod: AnyModule | null = null;
let c2paLoadError: string | null = null;
function loadC2pa(): AnyModule | null {
  if (c2paMod) return c2paMod;
  if (c2paLoadError) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    c2paMod = require("@contentauth/c2pa-node") as AnyModule;
  } catch (e: any) {
    c2paLoadError = String(e?.message || e);
    c2paMod = null;
  }
  return c2paMod;
}

const AI_AGENT_RE =
  /(ai|gpt|dall|midjourn|stable[-\s]?diff|gemini|firefly|sd\d?|flux|sora|imagen|generat|gen-?ai|copliot|nova|seedream|kling|hailuo)/i;

function guessMime(filename?: string): string {
  if (!filename) return "image/jpeg";
  const ext = filename.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "heic":
    case "heif":
      return "image/heif";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

/** Bounded DFS: collect every `softwareAgent` object's `name` we can find. */
function collectSoftwareAgentNames(node: any, depth = 0, out: string[] = []): string[] {
  if (!node || typeof node !== "object" || depth > 8) return out;
  if (Array.isArray(node)) {
    for (const v of node) collectSoftwareAgentNames(v, depth + 1, out);
    return out;
  }
  if (typeof node.softwareAgent === "object" && node.softwareAgent?.name) {
    out.push(String(node.softwareAgent.name));
  }
  if (typeof node.name === "string" && /agent|generator|model/i.test(String(node.role || ""))) {
    out.push(String(node.name));
  }
  for (const k of Object.keys(node)) {
    if (k === "softwareAgent") continue;
    collectSoftwareAgentNames(node[k], depth + 1, out);
  }
  return out;
}

/** Bounded DFS: collect all leaf assertion labels we can find. */
function collectAssertionLabels(node: any, depth = 0, out: string[] = []): string[] {
  if (!node || typeof node !== "object" || depth > 8) return out;
  if (Array.isArray(node)) {
    for (const v of node) collectAssertionLabels(v, depth + 1, out);
    return out;
  }
  if (typeof node.label === "string") out.push(String(node.label));
  for (const k of Object.keys(node)) collectAssertionLabels(node[k], depth + 1, out);
  return out;
}

function asManifests(store: any): Record<string, any> {
  const m = store?.manifests;
  if (!m) return {};
  if (Array.isArray(m)) {
    const obj: Record<string, any> = {};
    for (const x of m) if (x && x.label) obj[String(x.label)] = x;
    return obj;
  }
  return m as Record<string, any>;
}

export async function detectC2PA(
  imageBuffer: Buffer,
  opts: { filename?: string; mimeType?: string; locale?: ServerLocale } = {}
): Promise<C2paResult> {
  const base: C2paResult = { modelId: "c2pa", found: false, available: false };

  const mod = loadC2pa();
  if (!mod || typeof mod.Reader !== "function") {
    return { ...base, available: false, error: c2paLoadError || "c2pa-native-unavailable" };
  }

  const mimeType = opts.mimeType || guessMime(opts.filename);
  let reader: any = null;
  try {
    const verifySettings =
      typeof mod.createVerifySettings === "function"
        ? mod.createVerifySettings({
            verifyAfterReading: true,
            verifyTrust: true,
            verifyTimestampTrust: false,
            ocspFetch: false,
            remoteManifestFetch: false,
          })
        : undefined;
    reader = await mod.Reader.fromAsset({ buffer: imageBuffer, mimeType }, verifySettings);
  } catch (e: any) {
    return { ...base, available: true, error: String(e?.message || e) };
  }

  // No manifest present in this asset (the common case for ordinary photos).
  if (!reader) {
    return { ...base, available: true, found: false };
  }

  try {
    const store: any = reader.json?.() ?? {};
    const manifests = asManifests(store);
    const activeLabel: string | undefined =
      (typeof reader.activeLabel === "function" ? reader.activeLabel() : undefined) ||
      store?.active_manifest;
    const active: any =
      (typeof reader.getActive === "function" ? reader.getActive() : undefined) ||
      (activeLabel ? manifests[activeLabel] : undefined);

    const found = !!active || Object.keys(manifests).length > 0;
    if (!found) {
      return {
        ...base,
        available: true,
        found: false,
        embedded: typeof reader.isEmbedded === "function" ? reader.isEmbedded() : undefined,
      };
    }

    const validationStatus: string =
      active?.validation_status || store?.validation_status || "unknown";
    const valid = validationStatus === "valid" || validationStatus === "validated";
    const isTampered = /invalid|tamper|fail|untrust/i.test(validationStatus);

    const certInfo = active?.signature?.cert_info || active?.claim?.signature?.cert_info || {};
    const signer: string | undefined =
      certInfo.subject || active?.signature?.cert_serial_number || undefined;
    const issuer: string | undefined = certInfo.issuer || undefined;
    const created: string | undefined =
      active?.claim?.creation_time || active?.claim?.created_at || undefined;

    const assertions: string[] = Array.from(
      new Set(collectAssertionLabels(active))
    );

    const agentNames = collectSoftwareAgentNames(active);
    const softwareAgent = agentNames[0];
    const aiGenerated =
      agentNames.some((n) => AI_AGENT_RE.test(n)) ||
      assertions.some((l) => /ai_generated|creativeWork|softwareagent/i.test(l));

    let raw: Record<string, unknown> | undefined;
    try {
      raw = JSON.parse(JSON.stringify(store));
    } catch {
      raw = undefined;
    }

    return {
      ...base,
      available: true,
      found: true,
      validationStatus,
      valid,
      isTampered,
      signer,
      issuer,
      created,
      softwareAgent,
      aiGenerated,
      assertions,
      embedded: typeof reader.isEmbedded === "function" ? reader.isEmbedded() : undefined,
      remoteUrl: typeof reader.remoteUrl === "function" ? reader.remoteUrl() : undefined,
      raw,
    };
  } catch (e: any) {
    return { ...base, available: true, found: true, error: String(e?.message || e) };
  }
}
