// C2PA / Content Credentials provenance verifier.
//
// Uses the official `@contentauth/c2pa-wasm` (v0.6.3) — the PURE-WASM build of
// the C2PA library. Unlike `@contentauth/c2pa-node` (which ships a NATIVE Rust
// addon .node binary that must be downloaded from GitHub Releases and often
// fails to install on hosts like Vercel), the WASM build is a single npm
// package with no native binary, no postinstall, and works identically on
// local machines, CI, and serverless (Vercel). This makes C2PA verification
// reliable in production without build hacks.
//
// Graceful degradation: if the WASM module cannot be loaded we return
// `available:false` instead of crashing the analysis pipeline.
import type { ServerLocale } from "@/lib/i18n/server";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// ── Node.js polyfills for @contentauth/c2pa-wasm ────────────────────────────
// The WASM build was designed for browsers and relies on `FileReaderSync`
// (a web-only API Node.js does not provide). It also calls `blob.slice()`
// internally while reading. We:
//   1. Provide a synchronous `FileReaderSync` whose `readAsArrayBuffer` pulls
//      the bytes straight from the Blob we constructed (no async bridge — which
//      would deadlock inside the WASM call stack).
//   2. Subclass `Blob` so slices retain a reference to the original parts,
//      letting the polyfill read them synchronously.
import { Blob as NativeBlob } from "node:buffer";

/** Flatten Blob parts into a single contiguous Uint8Array (sync, exact). */
function flattenParts(parts: Array<unknown>): Uint8Array {
  const bufs = (parts || []).filter(
    (p) => p && typeof p === "object" && (p as ArrayBufferView).byteLength != null
  ) as ArrayBufferView[];
  if (!bufs.length) return new Uint8Array(0);
  const total = bufs.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) {
    out.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), off);
    off += b.byteLength;
  }
  return out;
}

// A Blob that keeps a synchronous, exact view of its bytes so that
// FileReaderSync.readAsArrayBuffer returns PRECISELY the requested range —
// including after .slice(). The previous implementation propagated the full
// backing parts on slice(), which made every slice read the whole file and
// caused c2pa-wasm to misread offsets (OutOfMemory / "bad chunk name").
class SyncBlob extends NativeBlob {
  _bytes: Uint8Array;
  constructor(parts: Array<unknown>, options?: BlobPropertyBag) {
    super(parts as any, options);
    this._bytes = flattenParts(parts);
  }
  slice(start?: number, end?: number, contentType?: string): SyncBlob {
    const s = this._bytes.subarray(start ?? 0, end ?? this._bytes.length);
    return new SyncBlob([s], contentType ? { type: contentType } : undefined);
  }
}

let polyfillInstalled = false;
function installPolyfills(): void {
  if (polyfillInstalled) return;
  polyfillInstalled = true;

  // FileReaderSync is absent in Node.js — provide a sync implementation that
  // returns the EXACT bytes of the (possibly sliced) blob.
  if (typeof (globalThis as any).FileReaderSync === "undefined") {
    (globalThis as any).FileReaderSync = class {
      readAsArrayBuffer(blob: any): ArrayBuffer {
        const bytes: Uint8Array | undefined = blob?._bytes;
        if (bytes && bytes.byteLength != null) {
          // Copy into a fresh ArrayBuffer of exactly the right length.
          return new Uint8Array(bytes).buffer;
        }
        // Fallback for non-SyncBlob blobs (e.g. propagated _parts).
        const parts: Array<unknown> = blob?._parts;
        if (Array.isArray(parts) && parts.length) {
          const out = flattenParts(parts);
          if (out.byteLength) return new Uint8Array(out).buffer;
        }
        throw new Error("FileReaderSync: cannot read blob synchronously");
      }
    };
  }
}

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

// Loose handle to the WASM module — we never rely on its typed surface.
type WasmModule = {
  // __wbg_init is the DEFAULT export of @contentauth/c2pa-wasm (the WASM
  // bootstrap function). We call it with an explicit .wasm byte buffer so it
  // works in Node.js serverless (Node's fetch() cannot load file:// URLs).
  default?: (opts: { module_or_path: Uint8Array }) => Promise<unknown>;
  WasmReader?: {
    // The WASM build is typed against the DOM Blob, but in Node.js we pass a
    // node:buffer-backed SyncBlob subclass. Its `bytes()` return type differs
    // (Uint8Array<ArrayBufferLike> vs Uint8Array<ArrayBuffer>), so we loosen
    // the parameter to `any` to avoid a spurious type conflict. The runtime
    // contract (a Blob with readable bytes) is satisfied by SyncBlob.
    fromBlob: (format: string, blob: any, context?: string | null) => Promise<any>;
  };
};

let c2paMod: WasmModule | null = null;
let c2paInitPromise: Promise<WasmModule | null> | null = null;
let c2paLoadError: string | null = null;

// Locate and read the c2pa_bg.wasm bytes. We try several strategies so the
// detector works both in plain Node scripts and inside the Next.js production
// bundle (where `import.meta.url`-based resolution can be unreliable and
// `createRequire` may not be available the same way). The most robust for
// `next start` / Vercel is the cwd-relative node_modules path.
async function resolveWasmBytes(): Promise<Uint8Array> {
  const candidates: string[] = [
    join(process.cwd(), "node_modules/@contentauth/c2pa-wasm/pkg/c2pa_bg.wasm"),
  ];
  try {
    const require = createRequire(import.meta.url);
    candidates.push(
      join(dirname(require.resolve("@contentauth/c2pa-wasm")), "c2pa_bg.wasm")
    );
  } catch {
    /* createRequire unavailable in this context — cwd path still tried */
  }

  let lastErr: unknown;
  for (const p of candidates) {
    try {
      const buf = await readFile(p);
      if (buf && buf.length) return new Uint8Array(buf);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    "c2pa-wasm: could not locate c2pa_bg.wasm (tried " +
      candidates.length +
      " path(s)); last error: " +
      String(lastErr)
  );
}

async function loadC2pa(): Promise<WasmModule | null> {
  if (c2paMod) return c2paMod;
  if (c2paLoadError) return null;
  if (c2paInitPromise) return c2paInitPromise;

  c2paInitPromise = (async () => {
    try {
      const mod = (await import("@contentauth/c2pa-wasm")) as unknown as WasmModule;
      if (typeof mod.default === "function") {
        const wasmBytes = await resolveWasmBytes();
        await mod.default({ module_or_path: new Uint8Array(wasmBytes) });
      }
      // Node.js lacks FileReaderSync (browser-only) which c2pa-wasm needs.
      installPolyfills();
      c2paMod = mod;
      return mod;
    } catch (e: any) {
      c2paLoadError = String(e?.message || e);
      c2paMod = null;
      return null;
    }
  })();

  return c2paInitPromise;
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

  const mod = await loadC2pa();
  if (!mod || typeof mod.WasmReader?.fromBlob !== "function") {
    return { ...base, available: false, error: c2paLoadError || "c2pa-wasm-unavailable" };
  }

  const mimeType = opts.mimeType || guessMime(opts.filename);
  let reader: any = null;
  try {
    // Use SyncBlob so the FileReaderSync polyfill can read bytes synchronously
    // AND so .slice() returns exact, in-range bytes (the WASM reader seeks by
    // slicing the blob; a sloppy slice would corrupt the parse → OOM/bad chunk).
    const blob = new SyncBlob([new Uint8Array(imageBuffer)]);
    reader = await mod.WasmReader.fromBlob(mimeType, blob);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // A normal photo with no C2PA manifest throws rather than returning null.
    // `JumbfNotFound` is c2pa-wasm's explicit "no manifest store here" signal;
    // the others are malformed/unsupported-asset cases. Treat all as "not
    // found" (graceful) instead of surfacing an error to the user.
    if (/invalidasset|bad chunk|no matching|unsupported|parse|format|jumbf|notfound|no manifest/i.test(msg)) {
      return { ...base, available: true, found: false };
    }
    return { ...base, available: true, error: msg };
  }

  // fromBlob returns null/undefined when no C2PA manifest store is present.
  if (!reader) {
    return { ...base, available: true, found: false };
  }

  try {
    // reader.json() returns a JSON *string* in the WASM build.
    const storeRaw: any = reader.json?.() ?? "{}";
    const store: any = typeof storeRaw === "string" ? JSON.parse(storeRaw) : storeRaw;
    const manifests = asManifests(store);
    const activeLabel: string | undefined =
      (typeof reader.activeLabel === "function" ? reader.activeLabel() : undefined) ||
      store?.active_manifest;
    const active: any =
      (typeof reader.activeManifest === "function" ? reader.activeManifest() : undefined) ||
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
