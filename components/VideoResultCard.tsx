"use client";

import { useT, useLocale } from "@/lib/i18n/context";
import type { VideoResult } from "@/lib/video/types";

const VERDICT_STYLE: Record<string, { label: string; text: string; bg: string; border: string; icon: string }> = {
  likely_ai: { label: "video.verdict_ai", text: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: "🤖" },
  likely_real: { label: "video.verdict_real", text: "text-green-700", bg: "bg-green-50", border: "border-green-200", icon: "📸" },
  uncertain: { label: "video.verdict_uncertain", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: "❓" },
};

export default function VideoResultCard({ result }: { result: VideoResult }) {
  const t = useT();
  const { locale } = useLocale();
  const v = VERDICT_STYLE[result.verdict] ?? VERDICT_STYLE.uncertain;
  const hasEvidence = Array.isArray(result.evidence) && result.evidence.length > 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <div className={`rounded-xl border ${v.border} ${v.bg} p-4 mb-4`}>
        <p className={`text-sm font-medium ${v.text}`}>
          {v.icon} {t(v.label)}
        </p>
        <p className="text-4xl font-bold text-slate-900 mt-1">
          {result.aiProbability}%
          <span className="text-sm font-normal text-slate-500 ml-2">{t("video.aiProb")}</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {t("video.confidence", { confidence: result.confidence })}
        </p>
      </div>

      {result.summary && (
        <p className="text-sm text-slate-700 mb-4">{result.summary}</p>
      )}

      {hasEvidence ? (
        <ul className="space-y-2 mb-4">
          {result.evidence.map((ev, i) => {
            const cls =
              ev.type === "real"
                ? "bg-green-100 text-green-700 border-green-200"
                : ev.type === "ai"
                  ? "bg-red-100 text-red-700 border-red-200"
                  : "bg-gray-100 text-gray-600 border-gray-200";
            return (
              <li key={i} className={`text-sm border rounded-lg px-3 py-2 ${cls}`}>
                <span className="font-medium">{ev.label}</span>
                {ev.detail && <span className="block text-xs opacity-80 mt-0.5">{ev.detail}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 mb-4">
          <p className="text-sm text-indigo-700 font-medium">{t("video.paywallTitle")}</p>
          <p className="text-xs text-indigo-600/80 mt-1">{t("video.paywallDesc")}</p>
          <button
            onClick={() => {
              const el = document.querySelector<HTMLButtonElement>('[data-auth-action="signup"]');
              el?.click();
            }}
            className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg min-h-[44px]"
          >
            {t("video.upgrade")}
          </button>
        </div>
      )}

      <p className="text-xs text-slate-400">
        {result.engine === "mock"
          ? t("video.engineMock")
          : t("video.engineSightengine")}
        {result.durationSec ? ` · ${t("video.duration", { s: result.durationSec })}` : ""}
        {result.framesAnalyzed ? ` · ${t("video.frames", { n: result.framesAnalyzed })}` : ""}
      </p>
    </div>
  );
}
