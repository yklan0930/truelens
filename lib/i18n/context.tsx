"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import zh from "@/messages/zh.json";
import en from "@/messages/en.json";

export type Locale = "zh" | "en";

const messages: Record<Locale, Record<string, unknown>> = { zh, en };

const LOCALE_STORAGE_KEY = "truelens_locale";

// Flatten nested objects to dot-notation keys
function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, fullKey));
    } else if (typeof value === "string") {
      result[fullKey] = value;
    }
  }
  return result;
}

// Pre-flatten all locale messages at module level
const flattenedMessages: Record<Locale, Record<string, string>> = {
  zh: flatten(zh),
  en: flatten(en),
};

function detectBrowserLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    // localStorage not available
  }

  // Detect from browser language
  const navLang = navigator.language?.toLowerCase() || "";
  if (navLang.startsWith("zh")) return "zh";

  // Default to English for non-Chinese browsers
  return "en";
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || "zh");

  // Detect browser locale on mount (client-side only)
  useEffect(() => {
    if (!initialLocale) {
      const detected = detectBrowserLocale();
      setLocaleState(detected);
    }
  }, [initialLocale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // localStorage not available
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = flattenedMessages[locale];
      let text = dict[key];
      if (text === undefined) {
        // Fallback to Chinese
        text = flattenedMessages["zh"][key];
        if (text === undefined) return key;
      }
      if (params) {
        return text.replace(/\{(\w+)\}/g, (_, paramKey: string) =>
          String(params[paramKey] ?? `{${paramKey}}`)
        );
      }
      return text;
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return { locale: ctx.locale, setLocale: ctx.setLocale };
}

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within LocaleProvider");
  return ctx.t;
}

// Export raw messages for server-side use
export { messages, zh, en };
