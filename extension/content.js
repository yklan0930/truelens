// TrueLens Chrome Extension — Content Script
// Injects floating result card near the analyzed image

const MESSAGES = {
  en: {
    analyzing: "Analyzing...",
    analyzingDesc: "TrueLens is checking this image",
    verdictAi: "Likely AI-Generated",
    verdictReal: "Likely Real Photo",
    verdictUncertain: "Uncertain",
    aiProbability: "AI Probability",
    confidence: "Confidence",
    evidence: "Evidence",
    viewFull: "View Full Report",
    close: "Close",
    poweredBy: "Powered by TrueLens",
    realPhoto: "Real Photo",
    aiGenerated: "AI-Generated",
  },
  zh: {
    analyzing: "检测中...",
    analyzingDesc: "TrueLens 正在分析这张图片",
    verdictAi: "可能是 AI 生成",
    verdictReal: "可能是真实照片",
    verdictUncertain: "无法确定",
    aiProbability: "AI 生成概率",
    confidence: "置信度",
    evidence: "证据",
    viewFull: "查看完整报告",
    close: "关闭",
    poweredBy: "由 TrueLens 提供技术支持",
    realPhoto: "真实照片",
    aiGenerated: "AI 生成",
  },
};

function getMessages(locale) {
  if (locale === "zh") return MESSAGES.zh;
  const browserLang = navigator.language || "en";
  return browserLang.startsWith("zh") ? MESSAGES.zh : MESSAGES.en;
}

function createCard(imageSrc) {
  // Remove any existing TrueLens card
  removeCard();

  // Find the image element
  const images = document.querySelectorAll(`img[src="${CSS.escape(imageSrc)}"]`);
  const targetImg = images[0];
  if (!targetImg) return;

  const rect = targetImg.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const card = document.createElement("div");
  card.id = "truelens-card";
  card.className = "truelens-card truelens-loading";

  // Position near the image
  card.style.left = `${rect.left + scrollX}px`;
  card.style.top = `${rect.bottom + scrollY + 8}px`;

  card.innerHTML = `
    <div class="truelens-card-header">
      <div class="truelens-logo">T</div>
      <span class="truelens-title">TrueLens</span>
      <button class="truelens-close" title="Close">&times;</button>
    </div>
    <div class="truelens-card-body">
      <div class="truelens-spinner"></div>
      <div class="truelens-loading-text">${MESSAGES.en.analyzing}</div>
      <div class="truelens-loading-desc">${MESSAGES.en.analyzingDesc}</div>
    </div>
    <div class="truelens-card-footer">
      <span class="truelens-powered">truelens.top</span>
    </div>
  `;

  document.body.appendChild(card);

  // Close button
  card.querySelector(".truelens-close").addEventListener("click", removeCard);

  // Auto-remove on scroll (simplified)
  let scrollTimeout;
  const handleScroll = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const newRect = targetImg.getBoundingClientRect();
      card.style.left = `${newRect.left + scrollX}px`;
      card.style.top = `${newRect.bottom + window.scrollY + 8}px`;
    }, 100);
  };
  window.addEventListener("scroll", handleScroll, { passive: true });

  return card;
}

function updateCardWithResult(result, imageSrc, locale) {
  const msg = getMessages(locale);
  const card = document.getElementById("truelens-card");
  if (!card) return;

  card.classList.remove("truelens-loading");

  const verdictKey =
    result.verdict === "likely_ai"
      ? "verdictAi"
      : result.verdict === "likely_real"
        ? "verdictReal"
        : "verdictUncertain";

  const verdictClass =
    result.verdict === "likely_ai"
      ? "truelens-verdict-ai"
      : result.verdict === "likely_real"
        ? "truelens-verdict-real"
        : "truelens-verdict-uncertain";

  const probColor = result.aiProbability >= 50 ? "#dc2626" : "#16a34a";

  const evidenceHtml = result.evidence
    .slice(0, 3)
    .map(
      (ev) =>
        `<div class="truelens-evidence-item truelens-evidence-${ev.type}">
          <span class="truelens-evidence-label">${ev.label}</span>
          <span class="truelens-evidence-source">${ev.source}</span>
        </div>`
    )
    .join("");

  const body = card.querySelector(".truelens-card-body");
  body.innerHTML = `
    <div class="truelens-verdict-row">
      <div class="truelens-verdict-block ${verdictClass}">
        <span class="truelens-verdict-icon">${
          result.verdict === "likely_ai" ? "⚠️" : result.verdict === "likely_real" ? "✓" : "?"
        }</span>
        <span class="truelens-verdict-text">${msg[verdictKey]}</span>
      </div>
      <div class="truelens-prob-block">
        <div class="truelens-prob-label">${msg.aiProbability}</div>
        <div class="truelens-prob-value" style="color: ${probColor}">${result.aiProbability}%</div>
      </div>
    </div>
    <div class="truelens-prob-bar">
      <div class="truelens-prob-fill" style="width: ${result.aiProbability}%; background: ${probColor}"></div>
    </div>
    <div class="truelens-prob-labels">
      <span>${msg.realPhoto}</span>
      <span>${msg.aiGenerated}</span>
    </div>
    ${evidenceHtml ? `<div class="truelens-evidence-list">${evidenceHtml}</div>` : ""}
    <div class="truelens-meta">
      <span>${msg.confidence}: ${result.confidence}%</span>
      <span>${result.processingTimeMs}ms</span>
    </div>
    <a href="https://truelens.top" target="_blank" class="truelens-view-full">${msg.viewFull} →</a>
  `;

  // Update footer text
  const footer = card.querySelector(".truelens-powered");
  if (footer) footer.textContent = msg.poweredBy;
}

function updateCardWithError(error, imageSrc) {
  const card = document.getElementById("truelens-card");
  if (!card) return;

  card.classList.remove("truelens-loading");
  card.classList.add("truelens-error");

  const body = card.querySelector(".truelens-card-body");
  body.innerHTML = `
    <div class="truelens-error-icon">❌</div>
    <div class="truelens-error-text">${error}</div>
  `;
}

function removeCard() {
  const existing = document.getElementById("truelens-card");
  if (existing) existing.remove();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRUELENS_ANALYZING") {
    createCard(message.imageSrc);
  } else if (message.type === "TRUELENS_RESULT") {
    updateCardWithResult(message.result, message.imageSrc, message.locale);
  } else if (message.type === "TRUELENS_ERROR") {
    updateCardWithError(message.error, message.imageSrc);
  }
  sendResponse({ ok: true });
});
