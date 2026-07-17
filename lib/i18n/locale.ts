/**
 * Server-side i18n helpers for API routes.
 * API routes can't use React context, so we use a simple function approach.
 */
import { Locale } from "./context";

// Dynamically import message files
async function loadMessages(locale: Locale): Promise<Record<string, string>> {
  const mod = await import(`@/messages/${locale}.json`);
  return flattenObject(mod.default || mod);
}

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else if (typeof value === "string") {
      result[fullKey] = value;
    }
  }
  return result;
}

let cachedZh: Record<string, string> | null = null;
let cachedEn: Record<string, string> | null = null;

async function getMessages(locale: Locale): Promise<Record<string, string>> {
  if (locale === "zh") {
    if (!cachedZh) cachedZh = await loadMessages("zh");
    return cachedZh;
  }
  if (!cachedEn) cachedEn = await loadMessages("en");
  return cachedEn;
}

/**
 * Translate a key for a given locale, with optional params.
 * Returns the key itself if translation not found.
 */
export async function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): Promise<string> {
  const dict = await getMessages(locale);
  let text = dict[key];
  if (text === undefined) {
    // Fallback to Chinese
    const zhDict = await getMessages("zh");
    text = zhDict[key];
    if (text === undefined) return key;
  }
  if (params) {
    return text.replace(/\{(\w+)\}/g, (_, paramKey: string) =>
      String(params[paramKey] ?? `{${paramKey}}`)
    );
  }
  return text;
}

/**
 * Detect locale from Accept-Language header.
 */
export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return "zh";
  const lang = acceptLanguage.toLowerCase();
  if (lang.includes("zh")) return "zh";
  return "en";
}

// Default locale for server-side use
export const DEFAULT_LOCALE: Locale = "zh";
