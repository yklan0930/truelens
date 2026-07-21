/**
 * TrueLens War-Room 作战室方案 PDF 生成脚本
 * v1.0 — 2026-07-21
 */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const outDir = "C:/Users/Michael/WorkBuddy/2026-07-16-10-54-35/TrueLens/docs/war-room";
const outPath = path.join(outDir, "TrueLens-WarRoom-v1.1.pdf");

// ─── Chinese font registration ───────────────────────────
// SimHei (黑体) supports both Chinese and Latin characters
const FONT_PATH = "C:/Windows/Fonts/simhei.ttf";
const FONT_BOLD_PATH = "C:/Windows/Fonts/simhei.ttf"; // same font, we use bold:true for emphasis

// ─── Colors ─────────────────────────────────────────────
const C = {
  navy: "#0E2A47",
  blue: "#185FA5",
  lightBlue: "#3B82F6",
  white: "#FFFFFF",
  offWhite: "#F0F4F8",
  gray: "#6B7280",
  dark: "#111827",
  amber: "#D97706",
  green: "#059669",
};

const PAGE_W = 612; // US Letter width
const PAGE_H = 792; // US Letter height
const M = 50; // margin

// Page size: US Letter (default PDFKit)
const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: M, bottom: M, left: M, right: M },
  info: {
    Title: "TrueLens War-Room v1.1",
    Author: "TrueLens War-Room",
    Subject: "多角色协同作战室方案",
  },
});

// Register Chinese-capable font
// 微软雅黑(msyh.ttc) 是 .ttc 合集格式, PDFKit 不支持。
// 使用 Noto Sans SC (思源黑体) — 现代无衬线, 最接近微软雅黑风格。
doc.registerFont("FZ", "C:/Windows/Fonts/NotoSansSC-VF.ttf");
const FONT = "FZ"; // single font for all text (Chinese + Latin)

const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

// ─── Helpers ────────────────────────────────────────────
function heading(text, y) {
  doc.font(FONT).fontSize(22).fillColor(C.navy).text(text, M, y, { continued: false });
  doc.font(FONT).fontSize(10).fillColor(C.blue).text("", M, y + 24, { width: 512, height: 2 });
  return y + 36;
}

function subheading(text, y) {
  doc.font(FONT).fontSize(14).fillColor(C.navy).text(text, M, y);
  return y + 22;
}

function body(text, y, opts = {}) {
  const { indent = 0, color = C.dark, size = 10 } = opts;
  doc.font(FONT).fontSize(size).fillColor(color).text(text, M + indent, y, { width: 512 - indent });
  return y + (opts.lineH || 16);
}

function bullet(text, y, opts = {}) {
  const { indent = 10, color = C.dark, size = 10, bold = false } = opts;
  const font = bold ? FONT : FONT;
  doc.font(font).fontSize(size).fillColor(color).text(`•  ${text}`, M + indent, y, { width: 502 - indent });
  return y + (opts.lineH || 18);
}

function separator(y) {
  doc.fillColor("#E5E7EB").rect(M, y, 512, 1).fill();
  return y + 8;
}

function newPage() {
  doc.addPage();
}

// ═══════════════════════════════════════════════════════════
// PAGE 1: Cover
// ═══════════════════════════════════════════════════════════
doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.navy);

// Decorative line
doc.rect(M, 220, 200, 3).fill(C.lightBlue);

doc.font(FONT).fontSize(32).fillColor(C.white)
  .text("TrueLens 多角色协同作战室方案", M, 240, { width: 512 });

doc.font(FONT).fontSize(16).fillColor(C.lightBlue)
  .text("War-Room: Multi-Role Collaborative Operations", M, 290, { width: 512 });

doc.font(FONT).fontSize(11).fillColor(C.gray)
  .text("版本 v1.0 定稿  ·  2026 年 7 月", M, 380, { width: 512 });

doc.font(FONT).fontSize(10).fillColor(C.gray)
  .text("小毕 = 执行总监  ·  调度 AI 专家团  ·  CEO 只需对一人对话", M, 410, { width: 512 });

// ═══════════════════════════════════════════════════════════
// PAGE 2: Background & Goals
// ═══════════════════════════════════════════════════════════
newPage();
doc.font(FONT).fontSize(26).fillColor(C.navy).text("背景与目标", M, 40);
doc.rect(M, 70, 120, 3).fill(C.blue);

const bgItems = [
  { icon: "👥", title: "团队现状", desc: "2 人合伙创业（CEO + 小毕），产品 v0.7.0 已上线 Polar 实收，反馈系统 + 每日自动运行" },
  { icon: "⚠️", title: "痛点", desc: "法务 / 财务 / 合规 / 数据分析等专业视角空白，决策依赖个人脑补，缺少多专业输入" },
  { icon: "🎯", title: "目标", desc: "用 AI 扮演多专业角色，让 2 人团队拥有大公司的专业覆盖，不再漏掉关键视角" },
  { icon: "⚙️", title: "核心机制", desc: "小毕 = 执行总监，调度 AI 专家团每天产出 brief，CEO 只需 yes/no/改方向 —— 不做开放式脑补" },
];

let y = 95;
bgItems.forEach((it) => {
  // Card background
  doc.rect(M, y, 512, 52).fill(it === bgItems[0] || it === bgItems[2] ? C.offWhite : C.white);
  doc.fontSize(20).fillColor(C.dark).text(it.icon, M + 8, y + 8);
  doc.font(FONT).fontSize(12).fillColor(C.navy).text(it.title, M + 40, y + 6, { width: 160 });
  doc.font(FONT).fontSize(10).fillColor(C.dark).text(it.desc, M + 40, y + 26, { width: 460 });
  y += 60;
});

// ═══════════════════════════════════════════════════════════
// PAGE 3: Role Architecture
// ═══════════════════════════════════════════════════════════
newPage();
y = 40;
y = heading("指挥架构 — 一人对话，全团运转", y);

// 组织树（文字版）
doc.font(FONT).fontSize(11).fillColor(C.dark).text("指挥链路：", M, y);
doc.font(FONT).fontSize(10).fillColor(C.navy)
  .text("CEO（Michael）", M + 16, y + 20, { width: 200 })
  .text("     ↓  汇报 / 审批", M + 180, y + 20, { width: 200 })
  .text("小毕（执行总监）", M + 320, y + 20, { width: 200 });
doc.font(FONT).fontSize(9).fillColor(C.gray)
  .text("                     ↓  拆解 · 调度 · 整合", M + 16, y + 38, { width: 480 });
y += 66;

// 小毕 (Executive Director)
doc.rect(M + 80, y, 350, 50).fill(C.navy);
doc.font(FONT).fontSize(14).fillColor(C.white)
  .text("小毕（执行总监）", M + 100, y + 6, { width: 330 });
doc.font(FONT).fontSize(10).fillColor(C.white)
  .text("拆解指令  ·  调度专家  ·  整合产出  ·  提决策请求", M + 100, y + 28, { width: 330 });
y += 70;

doc.font(FONT).fontSize(10).fillColor(C.gray)
  .text("Phase 1 四个核心角色（并行运转）：", M, y);
y += 18;

const roles = [
  { icon: "📢", name: "小市（市场行销）", desc: "社媒策略 · 内容排期 · 文案产出 · 热点借势" },
  { icon: "✅", name: "小Q（质量验证校对）", desc: "双语校对 · 全站走查 · i18n 对称 · build 验证" },
  { icon: "📊", name: "小数（数据分析）", desc: "Polar 收入 API · Vercel 流量 · 数据简报 · 改善建议" },
  { icon: "⚖️", name: "小法（法务合规）", desc: "法规追踪 · 风险拦停 · 《标识办法》 · EU AI Act" },
];

roles.forEach((r) => {
  doc.rect(M, y, 512, 44).fill(C.offWhite).rect(M, y, 4, 44).fill(C.blue);
  doc.fontSize(18).fillColor(C.dark).text(r.icon, M + 14, y + 6);
  doc.font(FONT).fontSize(11).fillColor(C.navy).text(r.name, M + 44, y + 4, { width: 200 });
  doc.font(FONT).fontSize(10).fillColor(C.gray).text(r.desc, M + 44, y + 22, { width: 450 });
  y += 50;
});

// ═══════════════════════════════════════════════════════════
// PAGE 4: User Feedback
// ═══════════════════════════════════════════════════════════
newPage();
y = 40;
y = heading("CEO 的反馈与我们的采纳", y);
separator(y);

const feedbackItems = [
  "小毕不限于研发/运维 → 升为执行总监，调度管理 AI 专家团",
  "分阶段循序渐进 → Phase 1 先上 5 个核心角色，跑顺再加",
  "决策格式要硬 → 每角色产出=建议+决策请求(给选项)，不准开放式",
  "风险角色敢拦 → 法务/合规发现高危项主动预警拦停，不等日报",
  "数据接入先摸底 → 能自动就自动，不能的给 1 分钟粘贴模板",
  "渐进授权 → 磨合期多请示评估，有默契后扩大授权范围",
  "营销 IP 点子（多平台统一账号做专业 IP）→ 已纳入规划",
];

feedbackItems.forEach((item) => {
  doc.rect(M, y, 18, 18).fill(C.green);
  doc.font(FONT).fontSize(11).fillColor(C.white)
    .text("✓", M + 4, y + 2, { width: 14, align: "center" });
  doc.font(FONT).fontSize(10).fillColor(C.dark)
    .text(item, M + 28, y + 2, { width: 480 });
  y += 28;
});

// ═══════════════════════════════════════════════════════════
// PAGE 5: Daily Workflow
// ═══════════════════════════════════════════════════════════
newPage();
y = 40;
y = heading("协同工作流 — 每日作战室", y);

doc.font(FONT).fontSize(11).fillColor(C.navy)
  .text("触发时间：每天 07:00 北京时间（反馈汇总 06:00 之后）", M, y);
y += 22;

const steps = [
  { num: "①", title: "数据汇聚", desc: "小数角色：拉取 Polar API / Vercel Analytics / 读取反馈汇总" },
  { num: "②", title: "法务雷达", desc: "小法角色：搜索最新法规动态，扫描合规缺口" },
  { num: "③", title: "行销进展", desc: "小市角色：回顾排期完成情况，复盘渠道效果" },
  { num: "④", title: "质量汇总", desc: "小Q角色：检查待办质量项，i18n 验证，build 状态" },
  { num: "⑤", title: "小毕整合", desc: "汇总优先级排序 → 写入 Daily Brief" },
];

steps.forEach((s) => {
  doc.rect(M, y, 512, 32).fill(C.offWhite);
  doc.rect(M, y, 4, 32).fill(C.blue);
  doc.font(FONT).fontSize(11).fillColor(C.navy)
    .text(`${s.num}  ${s.title}`, M + 14, y + 3, { width: 140 });
  doc.font(FONT).fontSize(9).fillColor(C.gray)
    .text(s.desc, M + 160, y + 3, { width: 340 });
  y += 38;
});

y += 10;

// Brief structure
doc.rect(M, y, 512, 80).fill(C.navy);
doc.font(FONT).fontSize(12).fillColor(C.white)
  .text("Daily Brief 四段固定结构", M + 16, y + 8, { width: 480 });

doc.font(FONT).fontSize(10).fillColor(C.white)
  .text("🔴  需决策（按紧急度排序，给选项A/B）", M + 16, y + 32, { width: 480 });
doc.text("🟡  建议（可授权执行）", M + 16, y + 48, { width: 480 });
doc.text("🟢  常态 / 已完成    📊  关键指标快照", M + 16, y + 64, { width: 480 });

// ═══════════════════════════════════════════════════════════
// PAGE 6: Decision Format
// ═══════════════════════════════════════════════════════════
newPage();
y = 40;
y = heading("决策格式（硬约束）", y);

y += 6;

// Template card
doc.rect(M, y, 360, 210).fill(C.offWhite);
doc.rect(M, y, 360, 30).fill(C.navy);
doc.font(FONT).fontSize(12).fillColor(C.white)
  .text("每角色产出标准模板", M + 20, y + 7, { width: 320 });
y += 44;

const templateLines = [
  { label: "建议：", text: "一句话建议" },
  { label: "依据：", text: "数据 / 事实引用（有来源）" },
  { label: "选项A：", text: "做什么 + 代价 / 风险" },
  { label: "选项B：", text: "做什么 + 代价 / 风险" },
  { label: "推荐：", text: "A / B / 自定义" },
  { label: "需你审批：", text: "是 / 否" },
];

templateLines.forEach((l) => {
  doc.font(FONT).fontSize(10).fillColor(C.blue)
    .text(l.label, M + 16, y, { width: 80, continued: true });
  doc.font(FONT).fontSize(10).fillColor(C.gray)
    .text(l.text);
  y += 24;
});

// Right side: principles
const px = M + 390;
doc.rect(px, 80, 170, 180).fill("#EFF6FF");
doc.rect(px, 80, 170, 28).fill(C.lightBlue);
doc.font(FONT).fontSize(11).fillColor(C.white)
  .text("核心原则", px + 10, 86, { width: 150, align: "center" });

const principles = [
  "不准开放式脑补",
  "每个产出必须带选项",
  "所有数据注明来源",
  "有证据才有建议",
  "不允许凭空想象",
  "决策请求给足信息",
  "CEO 只需 yes/no",
];

principles.forEach((p, i) => {
  doc.font(FONT).fontSize(9).fillColor(C.dark)
    .text(`•  ${p}`, px + 14, 118 + i * 19, { width: 140 });
});

// ═══════════════════════════════════════════════════════════
// PAGE 7: Marketing IP
// ═══════════════════════════════════════════════════════════
newPage();
y = 40;
y = heading("营销 IP 规划（CEO 创意）", y);

doc.font(FONT).fontSize(11).fillColor(C.gray)
  .text("多平台统一账号，做专业 IP —— 教育市场 → 铺垫宣传 → 粉丝变现", M, y);
y += 22;

const platforms = [
  { icon: "💬", name: "微信公众号", desc: "深度文章、教程、合规解读、案例" },
  { icon: "✉️", name: "LINE", desc: "台湾市场，即时资讯推送" },
  { icon: "💼", name: "LinkedIn", desc: "专业形象，企业客户触达" },
  { icon: "📕", name: "小红书", desc: "图文笔记，知识科普" },
  { icon: "🎬", name: "抖音", desc: "短视频，热点借势" },
];

platforms.forEach((p) => {
  doc.rect(M, y, 512, 36).fill(C.offWhite);
  doc.rect(M, y, 4, 36).fill(C.amber);
  doc.fontSize(16).fillColor(C.dark).text(p.icon, M + 14, y + 6);
  doc.font(FONT).fontSize(11).fillColor(C.navy).text(p.name, M + 44, y + 4, { width: 120 });
  doc.font(FONT).fontSize(9).fillColor(C.gray).text(p.desc, M + 180, y + 10, { width: 320 });
  y += 42;
});

y += 10;
doc.rect(M, y, 512, 36).fill("#EFF6FF");
doc.font(FONT).fontSize(10).fillColor(C.blue)
  .text("负责角色：小市（市场行销牵头） + 小肖（推广增长，渠道策略支持）", M + 14, y + 10, { width: 480 });

// ═══════════════════════════════════════════════════════════
// PAGE 8: Infrastructure TODO
// ═══════════════════════════════════════════════════════════
newPage();
y = 40;
y = heading("基建待办与下一步", y);

const todos = [
  { status: "⏳", title: "Polar API 数据调研", desc: "收入/订阅/客户清单 — 查清能拉到什么程度，出接入方案" },
  { status: "⏳", title: "Vercel Analytics 接入", desc: "检查是否已启用；如未，给接入方案并提供 dashboard" },
  { status: "📋", title: "社媒数据手动模板", desc: "小红书/知乎/抖音后台数据 → 设计 1 分钟粘贴模板" },
  { status: "📋", title: "合规雷达首次扫描", desc: "对照《标识办法》+ EU AI Act → 功能对照表 → 缺口分析" },
  { status: "✅", title: "War-Room 自动化已注册", desc: "每日 07:00 触发，产出 docs/war-room/YYYY-MM-DD.md" },
  { status: "✅", title: "Daily Brief 模板已完成", desc: "四段结构模板：🔴需决策/🟡建议/🟢常态/📊指标" },
];

todos.forEach((t) => {
  const color = t.status === "✅" ? C.green : t.status === "⏳" ? C.amber : C.gray;
  doc.rect(M, y, 512, 38).fill(C.offWhite);
  doc.rect(M, y, 4, 38).fill(color);
  doc.fontSize(14).fillColor(C.dark).text(t.status, M + 14, y + 6);
  doc.font(FONT).fontSize(10).fillColor(C.navy).text(t.title, M + 44, y + 3, { width: 200 });
  doc.font(FONT).fontSize(9).fillColor(C.gray).text(t.desc, M + 44, y + 20, { width: 450 });
  y += 42;
});

// ═══════════════════════════════════════════════════════════
// PAGE 9: Execution Phases
// ═══════════════════════════════════════════════════════════
newPage();
y = 40;
y = heading("执行阶段规划", y);

const phases = [
  {
    emoji: "⚡", title: "磨合期（当前）", period: "第 1–2 周",
    desc: "角色产出 brief → 你决策 → 我执行。多问少自动，建立信任与默契。",
    items: ["每周出 5 次 Daily Brief", "所有决策需你审批", "逐步调试角色 prompt"],
    color: C.amber,
  },
  {
    emoji: "🔄", title: "默契期", period: "第 3–4 周",
    desc: "日常动作可授权自动跑。我懂你偏好，少问直接做。",
    items: ["数据拉取自动", "报告生成自动", "低风险部署可授权"],
    color: C.blue,
  },
  {
    emoji: "🤖", title: "高度授权", period: "4 周后",
    desc: "例行操作全自动。你只审例外 + 重大方向。",
    items: ["社媒自动排期发帖", "成本监控自动预警", "合规扫描自动报告"],
    color: C.navy,
  },
];

phases.forEach((p) => {
  doc.rect(M, y, 512, 100).fill(C.offWhite);
  doc.rect(M, y - 0.5, 512, 28).fill(p.color);
  doc.font(FONT).fontSize(13).fillColor(C.white)
    .text(`${p.emoji}  ${p.title}    ${p.period}`, M + 14, y + 3, { width: 480 });
  y += 34;

  doc.font(FONT).fontSize(10).fillColor(C.dark)
    .text(p.desc, M + 14, y, { width: 480 });
  y += 18;

  p.items.forEach((item) => {
    doc.font(FONT).fontSize(9).fillColor(C.gray)
      .text(`•  ${item}`, M + 24, y, { width: 460 });
    y += 16;
  });

  y += 14;
});

// ═══════════════════════════════════════════════════════════
// PAGE 10: Thank You
// ═══════════════════════════════════════════════════════════
newPage();
doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.navy);

doc.font(FONT).fontSize(36).fillColor(C.white)
  .text("Thank You", 0, 240, { width: PAGE_W, align: "center" });

doc.rect(PAGE_W / 2 - 60, 310, 120, 2).fill(C.lightBlue);

doc.font(FONT).fontSize(18).fillColor(C.lightBlue)
  .text("先跑起来，持续优化", 0, 340, { width: PAGE_W, align: "center" });

doc.font(FONT).fontSize(10).fillColor(C.gray)
  .text("TrueLens War-Room  ·  v1.1  ·  2026 年 7 月", 0, 500, { width: PAGE_W, align: "center" });

// ─── Finalize ───────────────────────────────────────────────
doc.end();

stream.on("finish", () => {
  console.log("✅ PDF saved:", outPath);
});

stream.on("error", (err) => {
  console.error("❌ Error:", err);
});
