"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useT, useLocale, type Locale } from "@/lib/i18n/context";

interface Evidence {
  source: string;
  type: "real" | "ai" | "neutral";
  label: string;
  detail: string;
}

interface DetectionResult {
  aiProbability: number;
  verdict: "likely_ai" | "likely_real" | "uncertain";
  confidence: number;
  evidence: Evidence[];
  processingTimeMs: number;
  fileName: string;
  fileSize: number;
}

interface HistoryItem {
  id: string;
  thumbnail: string;
  fileName: string;
  aiProbability: number;
  verdict: DetectionResult["verdict"];
  timestamp: number;
}

const FREE_DAILY_LIMIT = 1;

// --- Quota helpers ---
function getTodayKey() {
  const now = new Date();
  return `truelens_count_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function getDailyCount() {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(getTodayKey()) || "0", 10);
}

function incrementDailyCount() {
  if (typeof window === "undefined") return;
  const key = getTodayKey();
  const count = getDailyCount();
  localStorage.setItem(key, String(count + 1));
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("truelens_count_") && k !== key) {
      localStorage.removeItem(k);
    }
  });
}

function getRemainingQuota() {
  return Math.max(0, FREE_DAILY_LIMIT - getDailyCount());
}

// --- History helpers ---
const HISTORY_KEY = "truelens_history";
const MAX_HISTORY = 10;

function getHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function addToHistory(item: HistoryItem) {
  if (typeof window === "undefined") return;
  const history = getHistory();
  history.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}

// --- Share card generator ---
async function generateShareCard(
  result: DetectionResult,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: Locale
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 600, 400);
  gradient.addColorStop(0, "#4f46e5");
  gradient.addColorStop(1, "#7c3aed");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(0, 0, 600, 400, 20);
  ctx.fill();

  // TrueLens logo
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText(t("share.cardTitle"), 30, 45);

  // Verdict
  const verdictKey =
    result.verdict === "likely_ai"
      ? "result.verdict_ai_share"
      : result.verdict === "likely_real"
        ? "result.verdict_real_share"
        : "result.verdict_uncertain_share";
  const verdictText = t(verdictKey);

  ctx.fillStyle = "white";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText(verdictText, 30, 100);

  // AI Probability big number
  const probColor = result.aiProbability >= 50 ? "#fca5a5" : "#86efac";
  ctx.fillStyle = probColor;
  ctx.font = "bold 72px system-ui, sans-serif";
  ctx.fillText(`${result.aiProbability}%`, 30, 200);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(t("share.cardAiProb"), 30, 230);

  // Evidence summary
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "13px system-ui, sans-serif";
  let y = 275;
  result.evidence.slice(0, 2).forEach((ev) => {
    const icon = ev.type === "real" ? "✅" : ev.type === "ai" ? "⚠️" : "📋";
    ctx.fillText(`${icon} ${ev.label}`, 30, y);
    y += 24;
  });

  // Confidence
  const confY = y > 305 ? y + 8 : 305;
  ctx.fillText(
    t("share.cardConfidence", { confidence: result.confidence, ms: result.processingTimeMs }),
    30,
    confY
  );

  // Bottom bar
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, 360, 600, 40);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(t("share.cardFooter"), 30, 386);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

export default function Home() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [quota, setQuota] = useState(FREE_DAILY_LIMIT);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [feedbackState, setFeedbackState] = useState<"none" | "good" | "bad" | "submitted">("none");
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuota(getRemainingQuota());
    setHistory(getHistory());
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError(t("errors.invalidImage"));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(t("errors.fileTooLarge"));
        return;
      }

      setError(null);
      setResult(null);
      setFileName(file.name);
      setFeedbackState("none");

      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    [t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDetect = async () => {
    if (!image) return;

    const remaining = getRemainingQuota();
    if (remaining <= 0) {
      setError(t("errors.quotaExhausted"));
      return;
    }

    setLoading(true);
    setError(null);
    setFeedbackState("none");

    try {
      const response = await fetch(image);
      const blob = await response.blob();
      const formData = new FormData();
      formData.append("image", blob, fileName);

      const res = await fetch("/api/detect", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t("errors.detectFailed"));
      }

      setResult(data.result);
      incrementDailyCount();
      setQuota(getRemainingQuota());

      addToHistory({
        id: `${Date.now()}`,
        thumbnail: image,
        fileName: data.result.fileName,
        aiProbability: data.result.aiProbability,
        verdict: data.result.verdict,
        timestamp: Date.now(),
      });
      setHistory(getHistory());

      // Scroll to result on mobile
      const el = document.getElementById("result-section");
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("errors.genericError");
      if (msg.includes("AbortError") || msg.includes("abort")) {
        setError(t("errors.timeout"));
      } else if (msg.includes("Failed to fetch") || msg.includes("fetch failed")) {
        setError(t("errors.networkError"));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setFileName("");
    setFeedbackState("none");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  // --- Share ---
  const handleShare = async () => {
    if (!result) return;
    setShareLoading(true);

    try {
      const blob = await generateShareCard(result, t, locale);
      const file = new File([blob], "truelens-result.png", { type: "image/png" });

      const verdictText =
        result.verdict === "likely_ai"
          ? t("result.verdict_ai")
          : t("result.verdict_real");

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: t("share.title"),
          text: t("share.textTemplate", {
            aiProbability: result.aiProbability,
            verdict: verdictText,
          }),
          url: "https://truelens.top",
          files: [file],
        });
      } else {
        // Fallback: copy text to clipboard
        const text = t("share.copyTemplate", {
          aiProbability: result.aiProbability,
          verdict: verdictText,
          confidence: result.confidence,
        });
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch {
      // Share cancelled or failed — no need to alert
    } finally {
      setShareLoading(false);
    }
  };

  // --- Feedback ---
  const submitEmojiFeedback = async (rating: "good" | "bad") => {
    setFeedbackState(rating);
    try {
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "emoji",
          rating,
          resultContext: result
            ? {
                aiProbability: result.aiProbability,
                verdict: result.verdict,
                fileName: result.fileName,
                processingTimeMs: result.processingTimeMs,
              }
            : null,
        }),
      });
    } catch {
      // Silent fail for feedback
    }
  };

  const submitDetailedFeedback = async () => {
    if (!feedbackMsg.trim()) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "detailed",
          message: feedbackMsg,
          rating: feedbackState === "bad" ? "bad" : undefined,
          resultContext: result
            ? {
                aiProbability: result.aiProbability,
                verdict: result.verdict,
                fileName: result.fileName,
                processingTimeMs: result.processingTimeMs,
              }
            : null,
        }),
      });
    } catch {
      // Silent
    }
    setFeedbackState("submitted");
    setShowFeedbackModal(false);
    setFeedbackMsg("");
  };

  const verdictConfig = useMemo(
    () => ({
      likely_ai: {
        label: t("result.verdict_ai"),
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        icon: "⚠️",
      },
      likely_real: {
        label: t("result.verdict_real"),
        color: "text-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-200",
        icon: "✓",
      },
      uncertain: {
        label: t("result.verdict_uncertain"),
        color: "text-yellow-600",
        bgColor: "bg-yellow-50",
        borderColor: "border-yellow-200",
        icon: "?",
      },
    }),
    [t]
  );

  const evidenceColor = {
    real: "bg-green-100 text-green-700 border-green-200",
    ai: "bg-red-100 text-red-700 border-red-200",
    neutral: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return t("history.justNow");
    if (diff < 3600000) return t("history.minutesAgo", { n: Math.floor(diff / 60000) });
    if (diff < 86400000) return t("history.hoursAgo", { n: Math.floor(diff / 3600000) });
    return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US");
  };

  const toggleLocale = () => {
    setLocale(locale === "zh" ? "en" : "zh");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shrink-0">
              T
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-slate-900">{t("common.brand")}</h1>
              <p className="text-xs text-slate-500">{t("common.tagline")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language Switcher */}
            <button
              onClick={toggleLocale}
              className="text-sm font-medium min-h-[44px] px-2 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1"
              title={locale === "zh" ? "Switch to English" : "切换为中文"}
            >
              <span>{locale === "zh" ? "EN" : "中文"}</span>
            </button>

            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors min-h-[44px] px-2"
              >
                {showHistory ? t("header.hideHistory") : t("header.showHistory")}
              </button>
            )}
            <div className="text-sm bg-slate-100 rounded-lg px-3 py-1.5">
              <span
                className={quota > 0 ? "text-indigo-600 font-semibold" : "text-slate-400"}
              >
                {t("header.quotaRemaining", { quota })}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        {/* History Panel */}
        {showHistory && history.length > 0 && (
          <div className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span>📜</span> {t("history.title", { count: history.length })}
              </h3>
              <button
                onClick={handleClearHistory}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors min-h-[44px] px-2"
              >
                {t("history.clear")}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200"
                  onClick={() => {
                    setImage(item.thumbnail);
                    setFileName(item.fileName);
                    setResult(null);
                    setShowHistory(false);
                    setFeedbackState("none");
                  }}
                >
                  <img
                    src={item.thumbnail}
                    alt={item.fileName}
                    className="w-full h-24 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-2">
                    <span
                      className={`text-xs font-bold ${
                        item.verdict === "likely_ai"
                          ? "text-red-300"
                          : item.verdict === "likely_real"
                            ? "text-green-300"
                            : "text-yellow-300"
                      }`}
                    >
                      {item.aiProbability}% AI
                    </span>
                    <span className="text-xs text-white/70 truncate">
                      {formatTime(item.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hero */}
        {!image && (
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              {t("hero.title")}
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base">
              {t("hero.description")}
            </p>
          </div>
        )}

        {/* Upload Area */}
        {!image && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all min-h-[200px] sm:min-h-[240px] flex flex-col items-center justify-center ${
              dragOver
                ? "border-indigo-500 bg-indigo-50"
                : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50"
            }`}
          >
            <div className="text-4xl sm:text-5xl mb-4">📸</div>
            <p className="text-lg font-medium text-slate-700 mb-1">{t("upload.dropHint")}</p>
            <div className="flex flex-col sm:flex-row gap-3 mt-3">
              <button
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <span>📁</span> {t("upload.selectImage")}
              </button>
              <button
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center gap-2 border border-slate-200"
                onClick={(e) => {
                  e.stopPropagation();
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.capture = "environment";
                  input.onchange = (ev) => {
                    const file = (ev.target as HTMLInputElement).files?.[0];
                    if (file) handleFile(file);
                  };
                  input.click();
                }}
              >
                <span>📷</span> {t("upload.takePhoto")}
              </button>
            </div>
            <p className="text-sm text-slate-400 mt-4">{t("upload.supportedFormats")}</p>
            {quota === 0 && (
              <p className="mt-3 text-sm text-orange-500">{t("upload.quotaExhaustedHint")}</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        )}

        {/* Image Preview + Result */}
        {image && (
          <div className="space-y-5">
            {/* Image Preview */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                <div className="sm:w-1/2 relative">
                  <img
                    src={image}
                    alt="Image to analyze"
                    className="w-full h-56 sm:h-72 object-cover"
                  />
                </div>
                <div className="sm:w-1/2 p-5 sm:p-6 flex flex-col justify-between">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">{t("upload.fileName")}</p>
                    <p className="font-medium text-slate-900 truncate">{fileName}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      {quota > 0
                        ? t("upload.quotaInfo", { quota })
                        : t("upload.quotaExhaustedBtn")}
                    </p>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={handleDetect}
                      disabled={loading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-medium py-3.5 px-6 rounded-xl transition-colors min-h-[48px]"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg
                            className="animate-spin h-5 w-5"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="none"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                          {t("common.loading")}
                        </span>
                      ) : (
                        t("upload.detect")
                      )}
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-5 py-3.5 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors min-h-[48px] shrink-0"
                    >
                      {t("upload.changeImage")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-start gap-3">
                <span className="text-lg shrink-0">❌</span>
                <div>
                  <p>{error}</p>
                  {error.includes(t("errors.quotaExhausted")) && (
                    <p className="mt-2 text-xs text-red-500">{t("errors.proComing")}</p>
                  )}
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div id="result-section" className="space-y-4 animate-in fade-in duration-500">
                {/* Verdict Card */}
                <div
                  className={`${verdictConfig[result.verdict].bgColor} ${
                    verdictConfig[result.verdict].borderColor
                  } border rounded-2xl p-5 sm:p-6`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">
                        {verdictConfig[result.verdict].icon}
                      </span>
                      <div>
                        <p
                          className={`text-xl sm:text-2xl font-bold ${verdictConfig[result.verdict].color}`}
                        >
                          {verdictConfig[result.verdict].label}
                        </p>
                        <p className="text-sm text-slate-500">
                          {t("result.confidence", { value: result.confidence })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">{t("result.aiProbability")}</p>
                      <p
                        className={`text-2xl sm:text-3xl font-bold ${result.aiProbability >= 50 ? "text-red-600" : "text-green-600"}`}
                      >
                        {result.aiProbability}%
                      </p>
                    </div>
                  </div>

                  {/* Probability Bar */}
                  <div className="relative h-3 sm:h-4 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`absolute left-0 top-0 h-full transition-all duration-1000 ${
                        result.aiProbability >= 50
                          ? "bg-gradient-to-r from-orange-400 to-red-500"
                          : "bg-gradient-to-r from-green-400 to-green-500"
                      }`}
                      style={{ width: `${result.aiProbability}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-slate-400">
                    <span>{t("result.prob_real")}</span>
                    <span>{t("result.prob_ai")}</span>
                  </div>
                </div>

                {/* Share */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleShare}
                      disabled={shareLoading}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-5 rounded-xl transition-colors min-h-[48px]"
                    >
                      <span>📤</span>{" "}
                      {shareLoading
                        ? t("share.generating")
                        : copied
                          ? t("share.copied")
                          : t("share.shareResult")}
                    </button>
                    <button
                      onClick={async () => {
                        const verdictText =
                          result.verdict === "likely_ai"
                            ? t("result.verdict_ai")
                            : t("result.verdict_real");
                        const text = `🔍 TrueLens: AI ${result.aiProbability}% — ${verdictText}\n🕵 ${t("share.copySuccess")} https://truelens.top`;
                        await navigator.clipboard.writeText(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 3000);
                      }}
                      className="flex items-center gap-2 text-slate-600 font-medium py-3 px-5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors min-h-[48px]"
                    >
                      <span>📋</span> {copied ? t("share.copied") : t("share.copyText")}
                    </button>
                  </div>
                  {copied && (
                    <p className="mt-2 text-xs text-green-600">{t("share.copySuccess")}</p>
                  )}
                </div>

                {/* Feedback */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    {feedbackState === "submitted" ? t("feedback.thanks") : t("feedback.title")}
                  </p>
                  {feedbackState === "submitted" ? (
                    <p className="text-sm text-slate-500">{t("feedback.thanksDesc")}</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => submitEmojiFeedback("good")}
                        className={`min-h-[48px] px-5 rounded-xl border-2 text-lg transition-all ${
                          feedbackState === "good"
                            ? "border-green-500 bg-green-50"
                            : "border-slate-200 hover:border-green-300 hover:bg-green-50"
                        }`}
                      >
                        👍 {t("feedback.accurate")}
                      </button>
                      <button
                        onClick={() => {
                          submitEmojiFeedback("bad");
                          setShowFeedbackModal(true);
                        }}
                        className={`min-h-[48px] px-5 rounded-xl border-2 text-lg transition-all ${
                          feedbackState === "bad"
                            ? "border-red-500 bg-red-50"
                            : "border-slate-200 hover:border-red-300 hover:bg-red-50"
                        }`}
                      >
                        👎 {t("feedback.inaccurate")}
                      </button>
                      <a
                        href="https://github.com/yklan0930/truelens/issues/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-slate-400 hover:text-indigo-500 transition-colors ml-auto min-h-[44px] flex items-center"
                      >
                        💬 {t("feedback.reportIssue")}
                      </a>
                    </div>
                  )}
                </div>

                {/* Evidence */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                  <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span>🔍</span> {t("result.evidenceTitle")}
                  </h3>
                  <div className="space-y-3">
                    {result.evidence.map((ev, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg border ${evidenceColor[ev.type]}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{ev.label}</span>
                          <span className="text-xs opacity-70">{ev.source}</span>
                        </div>
                        <p className="text-xs mt-1 opacity-80">{ev.detail}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-xs text-slate-400">
                    <span>
                      {t("result.fileSize", { size: (result.fileSize / 1024).toFixed(0) })}
                    </span>
                    <span>
                      {t("result.processingTime", { ms: result.processingTimeMs })}
                    </span>
                  </div>
                </div>

                {/* Disclaimer */}
                <p className="text-xs text-slate-400 text-center px-4">
                  {t("result.disclaimer")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Features (when no image) */}
        {!image && (
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <div className="text-2xl mb-2">🧠</div>
              <h3 className="font-bold text-slate-900 mb-1">
                {t("features.deepLearning.title")}
              </h3>
              <p className="text-sm text-slate-500">{t("features.deepLearning.desc")}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <div className="text-2xl mb-2">📋</div>
              <h3 className="font-bold text-slate-900 mb-1">
                {t("features.exifAnalysis.title")}
              </h3>
              <p className="text-sm text-slate-500">{t("features.exifAnalysis.desc")}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <div className="text-2xl mb-2">⚡</div>
              <h3 className="font-bold text-slate-900 mb-1">
                {t("features.fastResult.title")}
              </h3>
              <p className="text-sm text-slate-500">{t("features.fastResult.desc")}</p>
            </div>
          </div>
        )}
      </main>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="font-bold text-lg text-slate-900 mb-3">
              {t("feedback.modalTitle")}
            </h3>
            <p className="text-sm text-slate-500 mb-4">{t("feedback.modalDesc")}</p>
            <textarea
              value={feedbackMsg}
              onChange={(e) => setFeedbackMsg(e.target.value)}
              placeholder={t("feedback.modalPlaceholder")}
              className="w-full border border-slate-200 rounded-xl p-3 text-sm min-h-[100px] resize-y focus:outline-none focus:border-indigo-400"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowFeedbackModal(false);
                  setFeedbackMsg("");
                  setFeedbackState("none");
                }}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium min-h-[48px]"
              >
                {t("feedback.cancel")}
              </button>
              <button
                onClick={submitDetailedFeedback}
                disabled={!feedbackMsg.trim()}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-medium min-h-[48px]"
              >
                {t("feedback.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-slate-400 space-y-2">
          <p>{t("footer.description")}</p>
          <p>{t("footer.copyright")}</p>
          <div className="flex items-center justify-center gap-4 mt-1">
            <a
              href="https://github.com/yklan0930/truelens"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-500 transition-colors"
            >
              💻 {t("footer.github")}
            </a>
            <a
              href="https://github.com/yklan0930/truelens/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-500 transition-colors"
            >
              💬 {t("footer.feedback")}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
