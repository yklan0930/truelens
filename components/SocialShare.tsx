"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { buildSocialUrl, type SocialPlatform } from "@/lib/socialShare";

type PlatformDef = {
  key: SocialPlatform;
  labelKey: string;
  icon: string;
  color: string;
};

const PLATFORMS: PlatformDef[] = [
  { key: "wechat", labelKey: "social.wechat", icon: "💬", color: "#07c160" },
  { key: "facebook", labelKey: "social.facebook", icon: "📘", color: "#1877f2" },
  { key: "x", labelKey: "social.x", icon: "X", color: "#111827" },
  { key: "line", labelKey: "social.line", icon: "💚", color: "#00b900" },
  { key: "linkedin", labelKey: "social.linkedin", icon: "💼", color: "#0a66c2" },
  { key: "whatsapp", labelKey: "social.whatsapp", icon: "🟢", color: "#25d366" },
  { key: "telegram", labelKey: "social.telegram", icon: "✈️", color: "#229ed9" },
  { key: "reddit", labelKey: "social.reddit", icon: "👽", color: "#ff4500" },
  { key: "email", labelKey: "social.email", icon: "✉️", color: "#6b7280" },
];

export default function SocialShare({
  linkResolver,
  shareText,
  shareTitle,
}: {
  linkResolver: () => Promise<string | null>;
  shareText: string;
  shareTitle: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const resolveLink = async (): Promise<string> =>
    (await linkResolver()) ?? "https://truelens.top";

  const onShare = async (p: SocialPlatform) => {
    if (busy) return;
    setBusy(true);
    try {
      if (p === "wechat") {
        const link = await resolveLink();
        const { toDataURL } = await import("qrcode");
        const dataUrl = await toDataURL(link, { width: 240, margin: 1 });
        setQr(dataUrl);
        return;
      }
      const link = await resolveLink();
      const url = buildSocialUrl(p, { link, text: shareText, title: shareTitle });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // ignore — user may have blocked popups
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mt-5 mb-1">
        {t("social.title")}
      </p>
      <p className="text-xs text-slate-400 mb-3">{t("social.mobileHint")}</p>

      <div className="grid grid-cols-3 gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            onClick={() => onShare(p.key)}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-xs font-medium text-slate-700 disabled:opacity-50"
            style={{ borderTopColor: p.color, borderTopWidth: 3 }}
          >
            <span className="text-xl leading-none">{p.icon}</span>
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {qr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setQr(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-slate-800 mb-3">
              {t("social.wechat")}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="WeChat QR" className="mx-auto w-56 h-56" />
            <p className="text-xs text-slate-500 mt-3">
              {t("social.wechatQrHint")}
            </p>
            <button
              onClick={() => setQr(null)}
              className="mt-4 text-sm text-indigo-600 font-medium"
            >
              {t("social.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
