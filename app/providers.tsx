"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
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
    <SessionProvider>
      <LocaleProvider>
        <LocaleSync />
        {children}
      </LocaleProvider>
    </SessionProvider>
  );
}

// Export for use in server components that need locale
export { type Locale };
