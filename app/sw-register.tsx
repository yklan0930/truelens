"use client";

import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    // Only register the service worker in production.
    // In dev (localhost / 127.0.0.1) we skip it so the browser never
    // caches old bundles and hides local edits behind a stale SW.
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    if (process.env.NODE_ENV !== "production" || isLocalhost) {
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[TrueLens] SW registration failed:", err));
    }
  }, []);

  return null;
}
