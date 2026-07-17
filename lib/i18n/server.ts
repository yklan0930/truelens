/**
 * Server-side i18n helper.
 * Synchronous, no React context needed. Works in API routes, detectors, etc.
 */
import zh from "@/messages/zh.json";
import en from "@/messages/en.json";

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

const flatZh = flattenObject(zh);
const flatEn = flattenObject(en);

export type ServerLocale = "zh" | "en";

/**
 * Translate a key for the given locale, with optional params.
 */
export function serverT(
  locale: ServerLocale,
  key: string,
  params?: Record<string, string | number>
): string {
  const dict = locale === "en" ? flatEn : flatZh;
  let text = dict[key] ?? flatZh[key] ?? key;
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (_, paramKey: string) =>
      String(params[paramKey] ?? `{${paramKey}}`)
    );
  }
  return text;
}

/**
 * Detect locale from Accept-Language header.
 */
export function detectLocale(acceptLanguage: string | null): ServerLocale {
  if (!acceptLanguage) return "zh";
  const lang = acceptLanguage.toLowerCase();
  if (lang.includes("zh")) return "zh";
  return "en";
}
