// TrueLens Chrome Extension — Background Service Worker
// Handles context menu creation, image fetching, and API calls

const API_URL = "https://truelens.top/api/detect";
const STORAGE_KEY = "truelens_last_result";

const MESSAGES = {
  en: {
    menuTitle: "Check with TrueLens",
    analyzing: "Analyzing...",
    analyzingDesc: "TrueLens is checking this image",
    networkError: "Network error. Please try again.",
    timeout: "Detection timed out. Please try again.",
    error: "Detection failed: ",
    badgeAnalyzing: "...",
    badgeDone: "done",
    badgeError: "err",
  },
  zh: {
    menuTitle: "用 TrueLens 检测",
    analyzing: "检测中...",
    analyzingDesc: "TrueLens 正在分析这张图片",
    networkError: "网络错误，请重试。",
    timeout: "检测超时，请重试。",
    error: "检测失败：",
    badgeAnalyzing: "...",
    badgeDone: "完成",
    badgeError: "错误",
  },
};

function getMessages() {
  const lang = chrome.i18n.getUILanguage();
  return lang.startsWith("zh") ? MESSAGES.zh : MESSAGES.en;
}

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "checkWithTrueLens",
    title: chrome.i18n.getMessage("menuTitle") || "Check with TrueLens",
    contexts: ["image"],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "checkWithTrueLens") return;
  if (!info.srcUrl) return;

  const msg = getMessages();

  // Show loading state on the badge
  chrome.action.setBadgeText({ text: msg.badgeAnalyzing, tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: "#4f46e5", tabId: tab.id });

  // Tell content script to show floating loader
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "TRUELENS_ANALYZING",
      imageSrc: info.srcUrl,
    });
  } catch {
    // Content script might not be loaded (e.g. chrome:// pages)
  }

  try {
    // Fetch the image
    const imageResponse = await fetch(info.srcUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image (${imageResponse.status})`);
    }
    const imageBlob = await imageResponse.blob();

    // Validate it's an image
    if (!imageBlob.type.startsWith("image/")) {
      throw new Error("Not an image");
    }

    // Check size (10MB max)
    if (imageBlob.size > 10 * 1024 * 1024) {
      throw new Error("Image too large (max 10MB)");
    }

    // Send to TrueLens API
    const formData = new FormData();
    const fileName = info.srcUrl.split("/").pop()?.split("?")[0] || "image.jpg";
    formData.append("image", imageBlob, fileName);

    // Detect locale for API
    const locale = chrome.i18n.getUILanguage().startsWith("zh") ? "zh" : "en";

    const apiResponse = await fetch(API_URL, {
      method: "POST",
      body: formData,
      headers: {
        "Accept-Language": locale,
      },
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(data.error || msg.error);
    }

    const result = data.result;

    // Store result for popup
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...result,
        imageSrc: info.srcUrl,
        timestamp: Date.now(),
        locale,
      },
    });

    // Update badge
    const badgeText =
      result.aiProbability >= 50 ? "AI" : "OK";
    const badgeColor = result.aiProbability >= 50 ? "#dc2626" : "#16a34a";
    chrome.action.setBadgeText({ text: badgeText, tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId: tab.id });

    // Send result to content script for floating card
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TRUELENS_RESULT",
        result,
        imageSrc: info.srcUrl,
        locale,
      });
    } catch {
      // Content script not available — result is in storage for popup
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    chrome.action.setBadgeText({ text: msg.badgeError, tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626", tabId: tab.id });

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TRUELENS_ERROR",
        error: errorMsg.includes("Failed to fetch")
          ? msg.networkError
          : errorMsg.includes("AbortError")
            ? msg.timeout
            : msg.error + errorMsg,
        imageSrc: info.srcUrl,
      });
    } catch {
      // Content script not available
    }
  }
});
