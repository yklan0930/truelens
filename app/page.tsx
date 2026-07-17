"use client";

import { useState, useCallback, useRef, useEffect } from "react";

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
async function generateShareCard(result: DetectionResult): Promise<Blob> {
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
  ctx.fillText("🔍 TrueLens", 30, 45);

  // Verdict
  const verdictText =
    result.verdict === "likely_ai"
      ? "🤖 可能是 AI 生成"
      : result.verdict === "likely_real"
      ? "📸 可能是真实照片"
      : "❓ 无法确定";

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
  ctx.fillText("AI 生成概率", 30, 230);

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
  ctx.fillText(`置信度 ${result.confidence}% · 耗时 ${result.processingTimeMs}ms`, 30, y + 8);

  // Bottom bar
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, 360, 600, 40);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("truelens.top · AI 内容真伪检测", 30, 386);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

export default function Home() {
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

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件（JPG、PNG、WebP）");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("图片大小不能超过 10MB");
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
  }, []);

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
      setError("今日免费检测次数已用完。升级 Pro 即可无限检测 →");
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
        throw new Error(data.error || "检测失败");
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
      const msg = err instanceof Error ? err.message : "检测失败，请重试";
      if (msg.includes("AbortError") || msg.includes("abort")) {
        setError("检测超时，请重试。模型可能正在加载中。");
      } else if (msg.includes("Failed to fetch") || msg.includes("fetch failed")) {
        setError("网络连接失败，请检查网络后重试。");
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
      const blob = await generateShareCard(result);
      const file = new File([blob], "truelens-result.png", { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "TrueLens AI 检测结果",
          text: `${result.aiProbability}% AI 生成概率 — ${result.verdict === "likely_ai" ? "可能是 AI 生成" : "可能是真实照片"}`,
          url: "https://truelens.top",
          files: [file],
        });
      } else {
        // Fallback: copy text to clipboard
        const text = `🔍 TrueLens AI 检测结果\n\n📊 AI 生成概率：${result.aiProbability}%\n🔔 判定：${result.verdict === "likely_ai" ? "可能是 AI 生成" : "可能是真实照片"}\n⚡ 置信度：${result.confidence}%\n\n🕵️ 立即检测：https://truelens.top`;
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

  const verdictConfig = {
    likely_ai: {
      label: "可能是 AI 生成",
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      icon: "⚠️",
    },
    likely_real: {
      label: "可能是真实照片",
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      icon: "✓",
    },
    uncertain: {
      label: "无法确定",
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
      icon: "?",
    },
  };

  const evidenceColor = {
    real: "bg-green-100 text-green-700 border-green-200",
    ai: "bg-red-100 text-red-700 border-red-200",
    neutral: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleDateString("zh-CN");
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
              <h1 className="text-xl font-bold text-slate-900">TrueLens</h1>
              <p className="text-xs text-slate-500">AI 图片真伪检测</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors min-h-[44px] px-2"
              >
                {showHistory ? "隐藏历史" : "检测历史"}
              </button>
            )}
            <div className="text-sm bg-slate-100 rounded-lg px-3 py-1.5">
              <span className={quota > 0 ? "text-indigo-600 font-semibold" : "text-slate-400"}>
                今日剩余 {quota} 次
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
                <span>📜</span> 检测历史（最近 {history.length} 次）
              </h3>
              <button
                onClick={handleClearHistory}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors min-h-[44px] px-2"
              >
                清除历史
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
              这张图片是真人拍的，还是 AI 生成的？
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base">
              上传图片，TrueLens 用深度学习模型 + 元数据分析给出 AI 生成概率和证据。
              准确率 88.9%，秒级出结果。
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
            <p className="text-lg font-medium text-slate-700 mb-1">
              点击上传或拍照
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-3">
              <button
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <span>📁</span> 选择图片
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
                <span>📷</span> 拍照
              </button>
            </div>
            <p className="text-sm text-slate-400 mt-4">支持 JPG、PNG、WebP，最大 10MB</p>
            {quota === 0 && (
              <p className="mt-3 text-sm text-orange-500">
                今日免费次数已用完，检测结果仅供参考
              </p>
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
                    alt="待检测图片"
                    className="w-full h-56 sm:h-72 object-cover"
                  />
                </div>
                <div className="sm:w-1/2 p-5 sm:p-6 flex flex-col justify-between">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">文件名</p>
                    <p className="font-medium text-slate-900 truncate">{fileName}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      {quota > 0
                        ? `检测后将消耗今日免费额度，剩余 ${quota} 次`
                        : "今日免费次数已用完，仍可检测但建议升级 Pro"}
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
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          检测中...
                        </span>
                      ) : (
                        "开始检测"
                      )}
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-5 py-3.5 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors min-h-[48px] shrink-0"
                    >
                      换一张
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
                  {error.includes("次数已用完") && (
                    <p className="mt-2 text-xs text-red-500">
                      Pro 版即将上线：无限检测 + 视频检测 + 详细报告
                    </p>
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
                      <span className="text-3xl">{verdictConfig[result.verdict].icon}</span>
                      <div>
                        <p className={`text-xl sm:text-2xl font-bold ${verdictConfig[result.verdict].color}`}>
                          {verdictConfig[result.verdict].label}
                        </p>
                        <p className="text-sm text-slate-500">置信度 {result.confidence}%</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">AI 生成概率</p>
                      <p className={`text-2xl sm:text-3xl font-bold ${result.aiProbability >= 50 ? "text-red-600" : "text-green-600"}`}>
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
                    <span>真实照片</span>
                    <span>AI 生成</span>
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
                      <span>📤</span> {shareLoading ? "生成中..." : copied ? "已复制 ✓" : "分享结果"}
                    </button>
                    <button
                      onClick={async () => {
                        const text = `🔍 TrueLens AI 检测：AI 生成概率 ${result.aiProbability}%\n🕵️ 立即检测：https://truelens.top`;
                        await navigator.clipboard.writeText(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 3000);
                      }}
                      className="flex items-center gap-2 text-slate-600 font-medium py-3 px-5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors min-h-[48px]"
                    >
                      <span>📋</span> {copied ? "已复制 ✓" : "复制文字"}
                    </button>
                  </div>
                  {copied && (
                    <p className="mt-2 text-xs text-green-600">
                      {copied ? "已复制到剪贴板，粘贴到微信/朋友圈即可分享" : ""}
                    </p>
                  )}
                </div>

                {/* Feedback */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    {feedbackState === "submitted" ? "感谢你的反馈！" : "检测准确吗？"}
                  </p>
                  {feedbackState === "submitted" ? (
                    <p className="text-sm text-slate-500">我们会持续改进检测引擎 💪</p>
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
                        👍 准
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
                        👎 不准
                      </button>
                      <a
                        href="https://github.com/yklan0930/truelens/issues/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-slate-400 hover:text-indigo-500 transition-colors ml-auto min-h-[44px] flex items-center"
                      >
                        💬 反馈问题
                      </a>
                    </div>
                  )}
                </div>

                {/* Evidence */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                  <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span>🔍</span> 检测证据
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
                    <span>文件大小：{(result.fileSize / 1024).toFixed(0)} KB</span>
                    <span>检测耗时：{result.processingTimeMs}ms</span>
                  </div>
                </div>

                {/* Disclaimer */}
                <p className="text-xs text-slate-400 text-center px-4">
                  TrueLens 结果仅供参考，不作为法律证据。AI 检测技术仍在发展中，可能存在误判。
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
              <h3 className="font-bold text-slate-900 mb-1">深度学习</h3>
              <p className="text-sm text-slate-500">
                ViT 视觉模型分析像素级特征，检测 AI 生成痕迹
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <div className="text-2xl mb-2">📋</div>
              <h3 className="font-bold text-slate-900 mb-1">元数据分析</h3>
              <p className="text-sm text-slate-500">
                检查 EXIF 相机信息、GPS、时间戳等元数据完整性
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <div className="text-2xl mb-2">⚡</div>
              <h3 className="font-bold text-slate-900 mb-1">秒级出结果</h3>
              <p className="text-sm text-slate-500">
                多引擎并行检测，平均 2-3 秒返回概率评分和证据
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="font-bold text-lg text-slate-900 mb-3">
              哪里不准确？
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              告诉我们你的判断，帮助我们改进检测引擎。
            </p>
            <textarea
              value={feedbackMsg}
              onChange={(e) => setFeedbackMsg(e.target.value)}
              placeholder="例如：这是一张真实照片但被判为 AI..."
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
                取消
              </button>
              <button
                onClick={submitDetailedFeedback}
                disabled={!feedbackMsg.trim()}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-medium min-h-[48px]"
              >
                提交反馈
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-slate-400 space-y-2">
          <p>TrueLens — AI 内容真伪检测平台</p>
          <p>truelens.top | © 2026 Michael & 小毕</p>
          <div className="flex items-center justify-center gap-4 mt-1">
            <a
              href="https://github.com/yklan0930/truelens"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-500 transition-colors"
            >
              💻 GitHub
            </a>
            <a
              href="https://github.com/yklan0930/truelens/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-500 transition-colors"
            >
              💬 反馈问题
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
