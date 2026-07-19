// Client-side PDF report export for TrueLens (Pro / Business / Admin only).
//
// NOTE on Chinese (CJK) text:
// jsPDF's built-in fonts (helvetica/times/courier) only encode Latin/ASCII.
// Drawing Chinese strings with them produces garbled output. Embedding a CJK
// TTF into jsPDF is impractical (the font is ~10MB and jsPDF does not subset).
// Instead we build a self-contained report node, let the browser render it
// with its native CJK fonts, rasterize it with html2canvas, then place the
// resulting image across A4 pages. This guarantees correct Chinese display.

export interface ExportPdfInput {
  aiProbability: number;
  verdict: "likely_ai" | "likely_real" | "uncertain";
  confidence: number;
  evidence: { source: string; type: string; label: string; detail: string }[];
  signals?: { category: string; label: string; detail: string; lean: string; score?: number }[];
  screenRephoto?: boolean;
  processingTimeMs: number;
  fileName: string;
  fileSize: number;
  imageDataUrl: string | null;
  locale: "zh" | "en";
  t: (key: string, params?: Record<string, string | number>) => string;
}

// Inline (html2canvas-safe) colors — hex only, no oklch/color-mix.
const C = {
  indigo: "#4F46E5",
  white: "#FFFFFF",
  red: "#DC2626",
  green: "#16A34A",
  amber: "#B45309",
  amberBg: "#FEF3C7",
  amberText: "#92400E",
  slate: "#475569",
  slateSoft: "#64748B",
  slateLight: "#94A3B8",
  slate900: "#0F172A",
  border: "#E2E8F0",
};

const FONT_STACK =
  '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

function verdictKey(v: string): string {
  return v === "likely_ai"
    ? "verdict_ai"
    : v === "likely_real"
      ? "verdict_real"
      : "verdict_uncertain";
}

function typeColor(type: string): string {
  if (type === "real") return C.green;
  if (type === "ai") return C.red;
  return C.amber;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Build a detached, fully-styled report node (off-screen) for rasterization.
function buildReportNode(input: ExportPdfInput): HTMLElement {
  const { aiProbability, verdict, confidence, evidence, signals, screenRephoto, processingTimeMs, fileName, fileSize, imageDataUrl, locale, t } = input;

  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;left:-10000px;top:0;z-index:-1;width:560px;background:${C.white};color:${C.slate900};font-family:${FONT_STACK};box-sizing:border-box;`;

  // --- Header band ---
  const header = document.createElement("div");
  header.style.cssText = `background:${C.indigo};padding:18px 24px;color:${C.white};display:flex;align-items:center;gap:12px;`;
  const logoImg = document.createElement("img");
  logoImg.src = "/logo-icon.png";
  logoImg.style.cssText = "width:36px;height:36px;border-radius:8px;flex-shrink:0;";
  header.appendChild(logoImg);
  const brandWrap = document.createElement("div");
  const brand = document.createElement("div");
  brand.style.cssText = "font-size:20px;font-weight:700;line-height:1.2;";
  brand.textContent = "TrueLens";
  const sub = document.createElement("div");
  sub.style.cssText = "font-size:12px;opacity:0.85;margin-top:2px;";
  sub.textContent = t("pdf.title");
  brandWrap.append(brand, sub);
  header.append(brandWrap);

  // --- Body ---
  const body = document.createElement("div");
  body.style.cssText = "padding:24px;";

  // Image preview
  if (imageDataUrl) {
    const img = document.createElement("img");
    img.src = imageDataUrl;
    img.style.cssText =
      "display:block;max-width:100%;max-height:300px;margin:0 auto 18px;border-radius:12px;";
    body.appendChild(img);
  }

  // Verdict box
  const vColor = verdict === "likely_ai" ? C.red : verdict === "likely_real" ? C.green : C.amber;
  const verdictBox = document.createElement("div");
  verdictBox.style.cssText = `border:1.5px solid ${vColor};border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;`;
  const vLeft = document.createElement("div");
  const vLabel = document.createElement("div");
  vLabel.style.cssText = `color:${vColor};font-weight:700;font-size:15px;`;
  vLabel.textContent = t(`result.${verdictKey(verdict)}`);
  const vConf = document.createElement("div");
  vConf.style.cssText = `color:${C.slate};font-size:11px;margin-top:4px;`;
  vConf.textContent = t("result.confidence", { value: confidence });
  vLeft.append(vLabel, vConf);
  const vRight = document.createElement("div");
  vRight.style.cssText = `color:${vColor};font-weight:700;font-size:26px;text-align:right;`;
  vRight.textContent = `${aiProbability}%`;
  const vRightSub = document.createElement("div");
  vRightSub.style.cssText = `color:${C.slateLight};font-size:9px;text-align:right;`;
  vRightSub.textContent = t("result.aiProbability");
  const vRightWrap = document.createElement("div");
  vRightWrap.append(vRight, vRightSub);
  verdictBox.append(vLeft, vRightWrap);
  body.appendChild(verdictBox);

  // Screen re-photo advisory
  if (screenRephoto) {
    const box = document.createElement("div");
    box.style.cssText = `background:${C.amberBg};border:1px solid ${C.amber};border-radius:8px;padding:10px 12px;margin-bottom:16px;`;
    const title = document.createElement("div");
    title.style.cssText = `color:${C.amber};font-weight:700;font-size:11px;`;
    title.textContent = "⚠ " + t("evidence.screen_detected");
    const detail = document.createElement("div");
    detail.style.cssText = `color:${C.amberText};font-size:9px;margin-top:4px;line-height:1.4;`;
    detail.textContent = t("result.screenTip");
    box.append(title, detail);
    body.appendChild(box);
  }

  // Evidence / professional report
  const evTitle = document.createElement("div");
  evTitle.style.cssText = `color:${C.slate};font-weight:700;font-size:13px;margin-bottom:10px;`;
  evTitle.textContent = t("result.evidenceTitle");
  body.appendChild(evTitle);

  const items =
    signals && signals.length > 0
      ? signals.map((s) => ({
          type: s.lean,
          label: s.label,
          detail: s.detail,
          extra: s.score != null ? `${s.score}%` : "",
        }))
      : evidence.map((ev) => ({
          type: ev.type,
          label: ev.label,
          detail: ev.detail,
          extra: ev.source,
        }));

  for (const item of items) {
    const col = typeColor(item.type);
    const row = document.createElement("div");
    row.style.cssText = `border:1px solid ${C.border};border-left:3px solid ${col};border-radius:8px;padding:10px 12px;margin-bottom:10px;`;
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;";
    const label = document.createElement("span");
    label.style.cssText = `font-weight:600;font-size:11px;color:${C.slate900};`;
    label.textContent = item.label;
    head.appendChild(label);
    if (item.extra) {
      const extra = document.createElement("span");
      extra.style.cssText = `font-size:9px;color:${C.slateLight};`;
      extra.textContent = item.extra;
      head.appendChild(extra);
    }
    const detail = document.createElement("div");
    detail.style.cssText = `font-size:9px;color:${C.slate};margin-top:4px;line-height:1.4;`;
    detail.textContent = item.detail;
    row.append(head, detail);
    body.appendChild(row);
  }

  // Footer
  const rule = document.createElement("div");
  rule.style.cssText = `border-top:1px solid ${C.slateLight};margin:14px 0 10px;`;
  body.appendChild(rule);
  const disc = document.createElement("div");
  disc.style.cssText = `font-size:8px;color:${C.slateLight};line-height:1.5;`;
  disc.textContent = t("result.disclaimer");
  const meta = document.createElement("div");
  meta.style.cssText = `font-size:8px;color:${C.slateLight};margin-top:6px;line-height:1.5;`;
  meta.textContent = `${t("pdf.analyzed")}: ${fileName}  ·  ${t("result.fileSize", { size: Math.round(fileSize / 1024) })}  ·  ${t("result.processingTime", { s: (processingTimeMs / 1000).toFixed(2) })}`;
  const stamp = document.createElement("div");
  stamp.style.cssText = `font-size:8px;color:${C.slateLight};margin-top:3px;`;
  stamp.textContent = `${t("pdf.generatedAt")}: ${new Date().toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}  ·  truelens.top`;
  body.append(disc, meta, stamp);

  wrap.append(header, body);
  return wrap;
}

export async function exportResultPdf(input: ExportPdfInput): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  // Preload the image so html2canvas captures it reliably.
  if (input.imageDataUrl) {
    try {
      await loadImage(input.imageDataUrl);
    } catch {
      // continue without image if it fails to load
    }
  }

  const node = buildReportNode(input);
  document.body.appendChild(node);

  try {
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: C.white,
      useCORS: true,
      logging: false,
      windowWidth: 560,
    });

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 24;
    const PRINT_H = PAGE_H - MARGIN * 2;
    const imgW = PAGE_W - MARGIN * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    let heightLeft = imgH;
    let position = MARGIN;
    doc.addImage(imgData, "JPEG", MARGIN, position, imgW, imgH);
    heightLeft -= PRINT_H;
    while (heightLeft > 0) {
      const offset = heightLeft - imgH; // <= 0
      doc.addPage();
      doc.addImage(imgData, "JPEG", MARGIN, MARGIN + offset, imgW, imgH);
      heightLeft -= PRINT_H;
    }

    const safeName = input.fileName.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
    doc.save(`truelens_${safeName}.pdf`);
  } finally {
    document.body.removeChild(node);
  }
}
