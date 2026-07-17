"use client";

import { useEffect } from "react";
import { LocaleProvider, useLocale, type Locale } from "@/lib/i18n/context";

function LocaleSync() {
  const { locale } = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  return null;
}

export default function I18nProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider>
      <LocaleSync />
      {children}
    </LocaleProvider>
  );
}

// Export for use in server components that need locale
export { type Locale };
