// Client-side PDF report export for TrueLens (Pro / Business / Admin only).
// Uses jsPDF (dynamically imported so it never enters the SSR bundle).
// All text is localized via the `t` function passed from the component.

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

type RGB = [number, number, number];

const C: Record<string, RGB> = {
  indigo: [79, 70, 229],
  white: [255, 255, 255],
  red: [220, 38, 38],
  green: [22, 163, 74],
  amber: [180, 83, 9],
  amberText: [146, 64, 14],
  amberBg: [254, 243, 199],
  slate: [71, 85, 105],
  slateLight: [148, 163, 184],
};

function verdictKey(v: string): string {
  return v === "likely_ai"
    ? "verdict_ai"
    : v === "likely_real"
      ? "verdict_real"
      : "verdict_uncertain";
}

function getImageRatio(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

export async function exportResultPdf(input: ExportPdfInput): Promise<void> {
  const { aiProbability, verdict, confidence, evidence, signals, screenRephoto, processingTimeMs, fileName, fileSize, imageDataUrl, locale, t } = input;
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PAGE_W = 595.28;
  const MARGIN = 40;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const PAGE_BOTTOM = 842 - MARGIN;
  let y = 0;

  // --- Header band ---
  doc.setFillColor(...C.indigo);
  doc.rect(0, 0, PAGE_W, 70, "F");
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("TrueLens", MARGIN, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(t("pdf.title"), MARGIN, 52);
  y = 92;

  // --- Image preview ---
  if (imageDataUrl) {
    try {
      const ratio = await getImageRatio(imageDataUrl);
      const maxW = CONTENT_W;
      const maxH = 280;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      const x = (PAGE_W - w) / 2;
      doc.addImage(imageDataUrl, imageFormat(imageDataUrl), x, y, w, h);
      y += h + 18;
    } catch {
      // image embed failed — continue without it
    }
  }

  // --- Verdict box ---
  const vColor = verdict === "likely_ai" ? C.red : verdict === "likely_real" ? C.green : C.amber;
  const verdictLabel = t(`result.${verdictKey(verdict)}`);
  const boxH = 66;
  doc.setDrawColor(...vColor);
  doc.setLineWidth(1.5);
  doc.setFillColor(...C.white);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 8, 8, "FD");
  doc.setTextColor(...vColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(verdictLabel, MARGIN + 16, y + 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C.slate);
  doc.text(t("result.confidence", { value: confidence }), MARGIN + 16, y + 48);
  // AI probability (right aligned)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...vColor);
  const probText = `${aiProbability}%`;
  doc.text(probText, PAGE_W - MARGIN - doc.getTextWidth(probText), y + 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.slateLight);
  const aiLabel = t("result.aiProbability");
  doc.text(aiLabel, PAGE_W - MARGIN - doc.getTextWidth(aiLabel), y + 48);
  y += boxH + 18;

  // --- Screen re-photo advisory (if flagged) ---
  if (screenRephoto) {
    doc.setFillColor(...C.amberBg);
    doc.setDrawColor(...C.amber);
    doc.setLineWidth(1);
    doc.roundedRect(MARGIN, y, CONTENT_W, 46, 6, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...C.amber);
    doc.text("⚠ " + t("evidence.screen_detected"), MARGIN + 12, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.amberText);
    const lines = doc.splitTextToSize(t("result.screenTip"), CONTENT_W - 24);
    doc.text(lines, MARGIN + 12, y + 32);
    y += 46 + 14;
  }

  // --- Evidence / Professional report ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.slate);
  doc.text(t("result.evidenceTitle"), MARGIN, y);
  y += 14;

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
    const tColor = item.type === "real" ? C.green : item.type === "ai" ? C.red : C.amber;
    if (y > PAGE_BOTTOM - 60) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...C.slate);
    const labelLines = doc.splitTextToSize(item.label, CONTENT_W - 90);
    doc.text(labelLines, MARGIN, y);
    if (item.extra) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...C.slateLight);
      doc.text(item.extra, PAGE_W - MARGIN - doc.getTextWidth(item.extra), y);
    }
    y += labelLines.length * 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.slate);
    const detailLines = doc.splitTextToSize(item.detail, CONTENT_W - 16);
    doc.text(detailLines, MARGIN + 4, y);
    y += detailLines.length * 11 + 12;
  }

  // --- Footer: file info, timestamp, disclaimer ---
  if (y > PAGE_BOTTOM - 70) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setDrawColor(...C.slateLight);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.slateLight);
  const discLines = doc.splitTextToSize(t("result.disclaimer"), CONTENT_W);
  doc.text(discLines, MARGIN, y);
  y += discLines.length * 10 + 4;
  doc.text(
    `${t("pdf.analyzed")}: ${fileName}  ·  ${t("result.fileSize", { size: Math.round(fileSize / 1024) })}  ·  ${t("result.processingTime", { ms: processingTimeMs })}`,
    MARGIN,
    y
  );
  y += 12;
  doc.text(
    `${t("pdf.generatedAt")}: ${new Date().toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}  ·  truelens.top`,
    MARGIN,
    y
  );

  // --- Save ---
  const safeName = fileName.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
  doc.save(`truelens_${safeName}.pdf`);
}
