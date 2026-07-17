// TrueLens Chrome Extension — Popup Script
// Shows the latest detection result or a prompt to use the extension

const STORAGE_KEY = "truelens_last_result";

const MESSAGES = {
  en: {
    headerSubtitle: "AI Image Authenticity Detection",
    noResultTitle: "Right-click any image",
    noResultDesc: 'Select "Check with TrueLens" to detect if it\'s AI-generated',
    openSite: "Open TrueLens →",
    verdictAi: "Likely AI-Generated",
    verdictReal: "Likely Real Photo",
    verdictUncertain: "Uncertain",
    aiProbability: "AI Probability",
    realPhoto: "Real Photo",
    aiGenerated: "AI-Generated",
    confidence: "Confidence",
    viewFull: "View Full Report →",
    loading: "Analyzing...",
    loadingDesc: "TrueLens is checking this image",
  },
  zh: {
    headerSubtitle: "AI 图片真伪检测",
    noResultTitle: "右键点击任意图片",
    noResultDesc: '选择「用 TrueLens 检测」来判断是否 AI 生成',
    openSite: "打开 TrueLens →",
    verdictAi: "可能是 AI 生成",
    verdictReal: "可能是真实照片",
    verdictUncertain: "无法确定",
    aiProbability: "AI 生成概率",
    realPhoto: "真实照片",
    aiGenerated: "AI 生成",
    confidence: "置信度",
    viewFull: "查看完整报告 →",
    loading: "检测中...",
    loadingDesc: "TrueLens 正在分析这张图片",
  },
};

function getMessages(locale) {
  if (locale === "zh") return MESSAGES.zh;
  const browserLang = chrome.i18n.getUILanguage();
  return browserLang.startsWith("zh") ? MESSAGES.zh : MESSAGES.en;
}

function applyI18n(msg) {
  document.getElementById("header-subtitle").textContent = msg.headerSubtitle;
  document.getElementById("no-result-title").textContent = msg.noResultTitle;
  document.getElementById("no-result-desc").textContent = msg.noResultDesc;
  document.getElementById("open-site").textContent = msg.openSite;
  document.getElementById("prob-label").textContent = msg.aiProbability;
  document.getElementById("label-real").textContent = msg.realPhoto;
  document.getElementById("label-ai").textContent = msg.aiGenerated;
  document.getElementById("full-report").textContent = msg.viewFull;
  document.getElementById("loading-text").textContent = msg.loading;
}

async function init() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stored = data[STORAGE_KEY];

  const locale = stored?.locale;
  const msg = getMessages(locale);
  applyI18n(msg);

  if (!stored) {
    showState("no-result");
    return;
  }

  // Show result
  const result = stored;
  showResult(result, msg);
}

function showState(state) {
  ["no-result", "result", "loading"].forEach((s) => {
    document.getElementById(s).classList.toggle("hidden", s !== state);
  });
}

function showResult(result, msg) {
  showState("result");

  // Image
  const img = document.getElementById("result-image");
  img.src = result.imageSrc || "";
  img.onerror = () => {
    img.style.display = "none";
  };

  // Verdict
  const verdictKey =
    result.verdict === "likely_ai"
      ? "verdictAi"
      : result.verdict === "likely_real"
        ? "verdictReal"
        : "verdictUncertain";

  const verdictClass =
    result.verdict === "likely_ai"
      ? "verdict-ai"
      : result.verdict === "likely_real"
        ? "verdict-real"
        : "verdict-uncertain";

  const verdictEl = document.getElementById("result-verdict");
  verdictEl.className = `result-verdict ${verdictClass}`;

  document.getElementById("verdict-icon").textContent =
    result.verdict === "likely_ai" ? "⚠️" : result.verdict === "likely_real" ? "✓" : "?";
  document.getElementById("verdict-text").textContent = msg[verdictKey];

  // Probability
  const probColor = result.aiProbability >= 50 ? "#dc2626" : "#16a34a";
  const probValue = document.getElementById("prob-value");
  probValue.textContent = `${result.aiProbability}%`;
  probValue.style.color = probColor;

  const probFill = document.getElementById("prob-fill");
  probFill.style.width = `${result.aiProbability}%`;
  probFill.style.background = probColor;

  // Meta
  document.getElementById("meta-confidence").textContent = `${msg.confidence}: ${result.confidence}%`;
  document.getElementById("meta-time").textContent = `${result.processingTimeMs}ms`;

  // Evidence
  const evidenceList = document.getElementById("evidence-list");
  if (result.evidence && result.evidence.length > 0) {
    evidenceList.innerHTML = result.evidence
      .slice(0, 3)
      .map(
        (ev) =>
          `<div class="evidence-item evidence-${ev.type}">
            <span>${ev.label}</span>
            <span class="evidence-source">${ev.source}</span>
          </div>`
      )
      .join("");
  } else {
    evidenceList.innerHTML = "";
  }
}

// Listen for live updates while popup is open
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRUELENS_ANALYZING") {
    showState("loading");
  } else if (message.type === "TRUELENS_RESULT") {
    const msg = getMessages(message.locale);
    showResult({ ...message.result, imageSrc: message.imageSrc }, msg);
  }
  sendResponse({ ok: true });
});

init();
