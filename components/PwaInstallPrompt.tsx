"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";

export default function PwaInstallPrompt() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed (display-mode: standalone)
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Fallback: show hint after 8s even without install prompt event
    const timeout = setTimeout(() => {
      if (!show && !dismissed) setShow(true);
    }, 8000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(timeout);
    };
  }, [show, dismissed]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    // @ts-expect-error prompt() exists on BeforeInstallPromptEvent
    deferredPrompt.prompt();
    // @ts-expect-error userChoice exists
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setShow(false);
      setDeferredPrompt(null);
    }
  };

  if (dismissed || !show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-base shrink-0">
          T
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {t("pwa.installTitle")}
          </p>
          <p className="text-xs text-slate-500">{t("pwa.installDesc")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {deferredPrompt ? (
            <button
              onClick={handleInstall}
              className="bg-indigo-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors min-h-[36px]"
            >
              {t("pwa.install")}
            </button>
          ) : (
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: "TrueLens",
                    text: t("pwa.shareInstallText"),
                    url: "https://truelens.top",
                  });
                }
              }}
              className="bg-indigo-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors min-h-[36px]"
            >
              {t("pwa.addHome")}
            </button>
          )}
          <button
            onClick={() => {
              setShow(false);
              setDismissed(true);
            }}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
