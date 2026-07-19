"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useT, useLocale } from "@/lib/i18n/context";
import { generateShareCard, type ShareCardLabels } from "@/lib/shareCard";
import type { DetectionResult } from "@/lib/analyzer";

type StoredPayload = {
  result: DetectionResult;
  thumbnail: string | null;
};

const VERDICT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  likely_ai: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  likely_real: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  uncertain: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
};

export default function SharedResultPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const t = useT();
  const { locale } = useLocale();

  const [payload, setPayload] = useState<StoredPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [toast, setToast] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (!id) return;
    setStatus("loading");
    fetch(`/api/share/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not_found");
        const data = await r.json();
        setPayload(JSON.parse(data.payload) as StoredPayload);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [id]);

  const labels: ShareCardLabels = {
    cardTitle: t("share.cardTitle"),
    cardSubtitle: t("share.cardFooter"),
    verdictAi: t("result.verdict_ai_share"),
    verdictReal: t("result.verdict_real_share"),
    verdictUncertain: t("result.verdict_uncertain_share"),
    aiProb: t("share.cardAiProb"),
    confidence: (c, ms) => t("share.cardConfidence", { confidence: c, s: (ms / 1000).toFixed(2) }),
    cta: t("share.cardCta"),
    warning: t("share.cardWarning"),
    scan: t("share.cardScan"),
    footer: t("share.cardFooter"),
    noImage: t("share.noImage"),
  };

  const buildCard = async (): Promise<Blob | null> => {
    if (!payload) return null;
    const blob = await generateShareCard({
      result: payload.result,
      imageDataUrl: payload.thumbnail,
      showCta: false,
      labels,
    });
    blobRef.current = blob;
    return blob;
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((c) => (c === msg ? null : c)), 3000);
  };

  const download = async () => {
    const blob = blobRef.current ?? (await buildCard());
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "truelens-result.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyImage = async () => {
    const blob = blobRef.current ?? (await buildCard());
    if (!blob) return;
    try {
      if (navigator.clipboard && "write" in navigator.clipboard && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast(t("share.copyImageSuccess"));
        return;
      }
    } catch {
      /* fall through */
    }
    await download();
    showToast(t("share.savedImage"));
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-indigo-600 font-medium mb-6 hover:underline"
        >
          <img src="/logo-icon.png" alt="TrueLens" width={32} height={32} className="w-8 h-8 rounded-lg" />
          TrueLens
        </Link>

        {status === "loading" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
            {t("share.generating")}
          </div>
        )}

        {status === "error" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <p className="text-slate-700 font-medium">{t("share.shareResult")}</p>
            <p className="text-sm text-slate-500 mt-2">
              {locale === "zh" ? "该分享链接不存在或已失效。" : "This share link does not exist or has expired."}
            </p>
            <Link href="/" className="mt-4 inline-block text-indigo-600 hover:underline">
              {locale === "zh" ? "返回首页检测" : "Back to detection"}
            </Link>
          </div>
        )}

        {status === "ok" && payload && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h1 className="text-lg font-semibold text-slate-800 mb-4">
              {t("share.shareResult")}
            </h1>

            {payload.thumbnail && (
              <img
                src={payload.thumbnail}
                alt="shared"
                className="w-full rounded-xl border border-slate-200 mb-4"
              />
            )}

            {(() => {
              const r = payload.result;
              const v = VERDICT_STYLE[r.verdict] ?? VERDICT_STYLE.uncertain;
              return (
                <div className={`rounded-xl border ${v.border} ${v.bg} p-4 mb-4`}>
                  <p className={`text-sm font-medium ${v.text}`}>
                    {r.verdict === "likely_ai"
                      ? t("result.verdict_ai_share")
                      : r.verdict === "likely_real"
                        ? t("result.verdict_real_share")
                        : t("result.verdict_uncertain_share")}
                  </p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {r.aiProbability}%
                    <span className="text-sm font-normal text-slate-500 ml-2">
                      {t("share.cardAiProb")}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("share.cardConfidence", {
                      confidence: r.confidence,
                      s: (r.processingTimeMs / 1000).toFixed(2),
                    })}
                  </p>
                </div>
              );
            })()}

            {payload.result.screenRephoto && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-4 text-sm text-amber-800">
                {t("share.cardWarning")}
              </div>
            )}

            {payload.result.evidence && payload.result.evidence.length > 0 && (
              <ul className="space-y-2 mb-4">
                {payload.result.evidence.slice(0, 3).map((ev, i) => {
                  const icon = ev.type === "real" ? "✅" : ev.type === "ai" ? "⚠️" : "📋";
                  return (
                    <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                      <span>{icon}</span>
                      <span>{ev.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={download}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-5 rounded-xl min-h-[48px]"
              >
                <span>💾</span> {t("share.saveImage")}
              </button>
              <button
                onClick={copyImage}
                className="flex items-center gap-2 text-slate-700 font-medium py-3 px-5 rounded-xl border border-slate-200 hover:bg-slate-50 min-h-[48px]"
              >
                <span>🖼️</span> {t("share.copyImage")}
              </button>
            </div>

            {toast && <p className="mt-3 text-xs text-indigo-600">{toast}</p>}

            <p className="mt-4 text-xs text-slate-400">
              <Link href="/" className="text-indigo-500 hover:underline">
                {locale === "zh" ? "去 TrueLens 测测你自己的图片 →" : "Test your own image on TrueLens →"}
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
