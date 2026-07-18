// Client-side share-card generator for TrueLens.
// Renders a portrait result card (original thumbnail + verdict + probability +
// optional screen-rephoto warning + evidence/CTA + QR) to a PNG blob.
// Decoupled from next-intl: callers pass a resolved `labels` object.

// Minimal structural shape used by the share card — compatible with both the
// client-side DetectionResult (subset) and the full analyzer result.
export interface ShareCardResult {
  verdict: "likely_ai" | "likely_real" | "uncertain";
  aiProbability: number;
  confidence: number;
  screenRephoto?: boolean;
  evidence?: Array<{ type: string; label: string; source?: string }>;
  processingTimeMs: number;
}

export interface ShareCardLabels {
  cardTitle: string;
  cardSubtitle: string;
  verdictAi: string;
  verdictReal: string;
  verdictUncertain: string;
  aiProb: string;
  confidence: (c: number, ms: number) => string;
  cta: string;
  warning: string;
  scan: string;
  footer: string;
  noImage: string;
}

const VERDICT_COLOR = {
  likely_ai: "#dc2626",
  likely_real: "#16a34a",
  uncertain: "#d97706",
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draw an image into a box using "contain" fit (no distortion), centered.
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  boxW: number,
  boxH: number
) {
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (boxW - dw) / 2, y + (boxH - dh) / 2, dw, dh);
}

export async function generateShareCard(opts: {
  result: ShareCardResult;
  imageDataUrl?: string | null;
  showCta?: boolean;
  labels: ShareCardLabels;
}): Promise<Blob> {
  const { result, imageDataUrl, showCta = false, labels } = opts;

  const W = 640;
  const H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Header band
  const grad = ctx.createLinearGradient(0, 0, W, 110);
  grad.addColorStop(0, "#4f46e5");
  grad.addColorStop(1, "#7c3aed");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(labels.cardTitle, 32, 52);
  ctx.font = "15px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(labels.cardSubtitle, 32, 82);

  // Thumbnail
  const thumbX = 32;
  const thumbY = 130;
  const thumbW = W - 64;
  const thumbH = 300;
  ctx.fillStyle = "#f1f5f9";
  roundRect(ctx, thumbX, thumbY, thumbW, thumbH, 16);
  ctx.fill();
  ctx.save();
  roundRect(ctx, thumbX, thumbY, thumbW, thumbH, 16);
  ctx.clip();
  if (imageDataUrl) {
    try {
      const img = await loadImage(imageDataUrl);
      drawContain(ctx, img, thumbX, thumbY, thumbW, thumbH);
    } catch {
      /* ignore broken image */
    }
  }
  ctx.restore();
  if (!imageDataUrl) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(labels.noImage, thumbX + 16, thumbY + thumbH / 2);
  }

  const verdictColor = VERDICT_COLOR[result.verdict];
  const verdictText =
    result.verdict === "likely_ai"
      ? labels.verdictAi
      : result.verdict === "likely_real"
        ? labels.verdictReal
        : labels.verdictUncertain;

  // Verdict pill
  ctx.font = "bold 20px system-ui, sans-serif";
  const pillText = verdictText;
  const pillW = ctx.measureText(pillText).width + 36;
  const pillY = thumbY + thumbH + 28;
  ctx.fillStyle = verdictColor;
  roundRect(ctx, 32, pillY, pillW, 40, 20);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(pillText, 32 + 18, pillY + 27);

  // AI Probability (big)
  const probY = pillY + 92;
  ctx.fillStyle = verdictColor;
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.fillText(`${result.aiProbability}%`, 32, probY);
  ctx.fillStyle = "#475569";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(labels.aiProb, 32, probY + 26);

  // Confidence
  ctx.fillStyle = "#64748b";
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillText(labels.confidence(result.confidence, result.processingTimeMs), 32, probY + 58);

  // Warning banner (screen re-photo)
  let contentY = probY + 86;
  if (result.screenRephoto) {
    const warnY = contentY;
    ctx.fillStyle = "#fef3c7";
    roundRect(ctx, 32, warnY, W - 64, 48, 12);
    ctx.fill();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1;
    roundRect(ctx, 32, warnY, W - 64, 48, 12);
    ctx.stroke();
    ctx.fillStyle = "#92400e";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(labels.warning, 48, warnY + 30);
    contentY = warnY + 68;
  }

  // Evidence OR CTA
  ctx.font = "14px system-ui, sans-serif";
  if (showCta) {
    ctx.fillStyle = "#4f46e5";
    ctx.fillText(labels.cta, 32, contentY + 18);
  } else if (result.evidence && result.evidence.length > 0) {
    let y = contentY + 10;
    result.evidence.slice(0, 3).forEach((ev) => {
      const icon = ev.type === "real" ? "✅" : ev.type === "ai" ? "⚠️" : "📋";
      ctx.fillStyle = "#334155";
      ctx.fillText(`${icon} ${ev.label}`, 32, y + 16);
      y += 28;
    });
  }

  // QR code (bottom-right)
  try {
    const { toDataURL } = await import("qrcode");
    const qrDataUrl = await toDataURL("https://truelens.top", {
      width: 200,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
    const qrImg = await loadImage(qrDataUrl);
    const qrSize = 104;
    const qrX = W - 32 - qrSize;
    const qrY = 712;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 12);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = "#64748b";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(labels.scan, qrX, qrY + qrSize + 22);
  } catch {
    /* QR optional */
  }

  // Footer bar
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, H - 44, W, 44);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(labels.footer, 32, H - 16);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

// Downscale a data URL image to a small JPEG (for storing in the share payload).
export async function makeShareThumb(
  dataUrl: string,
  maxDim = 320
): Promise<string | null> {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d")!;
    cx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}
