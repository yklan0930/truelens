/**
 * TrueLens War-Room 作战室方案 PPT 生成脚本（精致版 v1.1）
 * 2026-07-21 — CEO 要求：组织架构图入册、配色/布局/插图升级、文案润饰
 */
const PptxGenJS = require("pptxgenjs");

// ─── Brand Colors ───────────────────────────────────────────
const C = {
  navy: "0E2A47",
  navy2: "13385C",
  blue: "185FA5",
  lightBlue: "3B82F6",
  white: "FFFFFF",
  offWhite: "F4F8FC",
  lightGray: "E2E8F0",
  gray: "64748B",
  dark: "1E293B",
  amber: "D97706",
  green: "059669",
  red: "DC2626",
  purple: "7C3AED",
  cyan: "0891B2",
  softBlue: "EFF6FF",
};

const F = "Microsoft YaHei";
const A = "docs/war-room/assets";
const ASSET = {
  bg: `${A}/content-bg.png`,
  hero: `${A}/cover-hero.png`,
  overlay: `${A}/cover-overlay.png`,
  lens: `${A}/lens-mark.png`,
  bar: `${A}/accent-bar.png`,
};

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "TrueLens War-Room";
pptx.title = "TrueLens 多角色协同作战室方案 v1.1";
pptx.subject = "War-Room Operations Plan";

// ─── Helpers ────────────────────────────────────────────────
function hex(h) { return h || undefined; }

function header(s, title, sub) {
  s.addText(title, {
    x: 0.6, y: 0.42, w: 12.1, h: 0.8,
    fontSize: 30, fontFace: F, color: hex(C.navy), bold: true, align: "left", valign: "middle",
  });
  s.addImage({ path: ASSET.bar, x: 0.62, y: 1.22, w: 2.5, h: 0.07 });
  if (sub) {
    s.addText(sub, {
      x: 0.6, y: 1.32, w: 12.1, h: 0.5,
      fontSize: 14, fontFace: F, color: hex(C.gray), italic: true, align: "left", valign: "middle",
    });
  }
}

function connector(s, x, y, w, h, color, width) {
  s.addShape(pptx.ShapeType.line, {
    x, y, w, h,
    line: { color: hex(color), width: width || 1.5 },
  });
}

// ─── Slide 1: Cover ─────────────────────────────────────────
function addCover() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.hero };
  s.addImage({ path: ASSET.overlay, x: 0, y: 0, w: 13.333, h: 7.5 });

  // Lens mark
  s.addImage({ path: ASSET.lens, x: 0.95, y: 0.85, w: 1.0, h: 1.0 });

  s.addText("TrueLens 多角色协同作战室", {
    x: 0.9, y: 2.15, w: 11.5, h: 1.25,
    fontSize: 42, fontFace: F, color: hex(C.white), bold: true, align: "left",
  });
  s.addText("War-Room · 一人对话，全团运转", {
    x: 0.92, y: 3.45, w: 11.0, h: 0.7,
    fontSize: 21, fontFace: F, color: hex(C.lightBlue), align: "left",
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0.95, y: 4.35, w: 3.2, h: 0.03, fill: { color: hex(C.lightBlue) },
  });
  s.addText("方案 v1.1 定稿   ·   2026 年 7 月", {
    x: 0.95, y: 4.55, w: 11.0, h: 0.5,
    fontSize: 15, fontFace: F, color: hex(C.white), align: "left",
  });
  s.addText("小毕 = 执行总监，调度 AI 专家团   ·   CEO 只需对一人对话", {
    x: 0.95, y: 6.55, w: 11.5, h: 0.5,
    fontSize: 13, fontFace: F, color: hex(C.lightGray), italic: true, align: "left",
  });
}

// ─── Slide 2: Background & Goals ────────────────────────────
function addBackground() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "背景与目标", "为什么需要作战室 — 让 2 人团队拥有大公司的专业覆盖密度");

  const items = [
    { icon: "👥", color: C.blue, title: "团队现状", desc: "2 人合伙创业（CEO + 小毕），产品 v0.7.0 已上线，Polar 实收，反馈系统 + 每日自动汇总已稳定运行" },
    { icon: "⚠️", color: C.amber, title: "核心痛点", desc: "法务 / 财务 / 合规 / 数据分析等专业视角长期空白，关键决策缺少多专业输入，容易漏掉风险" },
    { icon: "🎯", color: C.green, title: "作战目标", desc: "以 AI 扮演多专业角色，让小团队具备大公司的专业覆盖密度，决策不再依赖个人脑补" },
    { icon: "⚙️", color: C.navy, title: "核心机制", desc: "小毕 = 执行总监，调度 AI 专家团每日产出战情简报，CEO 只需 yes / no / 改方向" },
  ];

  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.6 + col * 6.25;
    const y = 2.05 + row * 2.35;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 5.95, h: 2.1, rectRadius: 0.12,
      fill: { color: hex(C.white) }, line: { color: hex(C.lightGray), width: 1 },
      shadow: { type: "outer", color: "BCC7D4", blur: 8, offset: 3, angle: 90, opacity: 0.35 },
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 0.12, h: 2.1, rectRadius: 0.06, fill: { color: hex(it.color) },
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.35, y: y + 0.35, w: 1.0, h: 1.0, rectRadius: 0.5,
      fill: { color: hex(it.color) },
    });
    s.addText(it.icon, { x: x + 0.35, y: y + 0.35, w: 1.0, h: 1.0, fontSize: 34, align: "center", valign: "middle" });
    s.addText(it.title, { x: x + 1.55, y: y + 0.32, w: 4.2, h: 0.5, fontSize: 18, fontFace: F, color: hex(C.navy), bold: true, valign: "middle" });
    s.addText(it.desc, { x: x + 1.55, y: y + 0.82, w: 4.15, h: 1.1, fontSize: 13, fontFace: F, color: hex(C.dark), valign: "top", lineSpacingMultiple: 1.1 });
  });
}

// ─── Slide 3: Org Chart ─────────────────────────────────────
function addOrgChart() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "指挥架构", "CEO 一人对话 → 小毕调度 → 专家团并行产出，决策链路清晰可控");

  const cx = 6.66;

  // CEO box
  s.addShape(pptx.ShapeType.roundRect, { x: 5.66, y: 1.55, w: 2.0, h: 0.7, rectRadius: 0.1, fill: { color: hex(C.navy) } });
  s.addText("CEO · Michael", { x: 5.66, y: 1.55, w: 2.0, h: 0.7, fontSize: 15, fontFace: F, color: hex(C.white), bold: true, align: "center", valign: "middle" });

  // CEO -> 小毕
  connector(s, cx, 2.25, 0, 0.45, C.gray, 1.5);

  // 小毕 box
  s.addShape(pptx.ShapeType.roundRect, { x: 4.16, y: 2.7, w: 5.0, h: 0.95, rectRadius: 0.12, fill: { color: hex(C.navy) }, shadow: { type: "outer", color: "1E3A5F", blur: 10, offset: 3, angle: 90, opacity: 0.4 } });
  s.addText([
    { text: "小毕 · 执行总监", options: { fontSize: 17, bold: true, color: hex(C.white), breakLine: true } },
    { text: "拆解指令 · 调度专家 · 整合产出 · 提决策请求", options: { fontSize: 11.5, color: hex(C.lightBlue) } },
  ], { x: 4.16, y: 2.7, w: 5.0, h: 0.95, align: "center", valign: "middle", fontFace: F });

  // 小毕 -> hub
  connector(s, cx, 3.65, 0, 0.3, C.gray, 1.5);

  // children definitions
  const kids = [
    { name: "小市", role: "市场行销", icon: "📢", color: C.blue, x: 0.6 },
    { name: "小Q", role: "质量验证", icon: "✅", color: C.green, x: 3.75 },
    { name: "小数", role: "数据分析", icon: "📊", color: C.cyan, x: 6.9 },
    { name: "小法", role: "法务合规", icon: "⚖️", color: C.red, x: 10.05 },
  ];
  const cardW = 2.6, cardH = 2.0, cardY = 4.0;
  const centers = kids.map((k) => k.x + cardW / 2);

  // hub horizontal
  connector(s, centers[0], 3.95, centers[3] - centers[0], 0, C.gray, 1.5);
  // verticals to children
  centers.forEach((c) => connector(s, c, 3.95, 0, cardY - 3.95, C.gray, 1.5));

  kids.forEach((k) => {
    s.addShape(pptx.ShapeType.roundRect, { x: k.x, y: cardY, w: cardW, h: cardH, rectRadius: 0.12, fill: { color: hex(C.white) }, line: { color: hex(C.lightGray), width: 1 }, shadow: { type: "outer", color: "BCC7D4", blur: 8, offset: 3, angle: 90, opacity: 0.35 } });
    s.addShape(pptx.ShapeType.roundRect, { x: k.x, y: cardY, w: cardW, h: 0.55, rectRadius: 0.12, fill: { color: hex(k.color) } });
    s.addShape(pptx.ShapeType.rect, { x: k.x, y: cardY + 0.4, w: cardW, h: 0.15, fill: { color: hex(k.color) } });
    s.addText(`${k.icon}  ${k.name}`, { x: k.x, y: cardY + 0.05, w: cardW, h: 0.5, fontSize: 15, fontFace: F, color: hex(C.white), bold: true, align: "center", valign: "middle" });
    s.addText(k.role, { x: k.x, y: cardY + 0.7, w: cardW, h: 0.5, fontSize: 16, fontFace: F, color: hex(C.navy), bold: true, align: "center", valign: "middle" });
    s.addText("Phase 1 核心角色", { x: k.x, y: cardY + 1.35, w: cardW, h: 0.4, fontSize: 11, fontFace: F, color: hex(C.gray), align: "center", valign: "middle" });
  });

  // Phase 2 expansion (dashed)
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 6.3, w: 12.13, h: 0.92, rectRadius: 0.1, fill: { color: hex(C.softBlue) }, line: { color: hex(C.lightBlue), width: 1.5, dashType: "dash" } });
  s.addText([
    { text: "Phase 2 待扩展    ", options: { fontSize: 13, bold: true, color: hex(C.blue) } },
    { text: "小肖（推广增长） · 小财（财务） · 小研（研发技术） · 信息安全 · 商务拓展", options: { fontSize: 13, color: hex(C.dark) } },
  ], { x: 0.8, y: 6.3, w: 11.7, h: 0.92, fontFace: F, align: "center", valign: "middle" });
}

// ─── Slide 4: Role Matrix ───────────────────────────────────
function addRoleMatrix() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "角色职责矩阵（Phase 1）", "四个专家角色并行运转，各自有清晰的职责边界与产出格式");

  const roles = [
    { icon: "📢", color: C.blue, name: "小市", role: "市场行销", duty: ["社媒内容策略与排期", "文案产出与热点借势", "渠道效果复盘"], out: "内容计划 + 文案草稿" },
    { icon: "✅", color: C.green, name: "小Q", role: "质量验证", duty: ["双语校对、全站走查", "i18n key 对称检查", "build / 回归验证"], out: "验证报告 + 阻断项" },
    { icon: "📊", color: C.cyan, name: "小数", role: "数据分析", duty: ["Polar 收入 API 拉取", "Vercel 流量与转化", "社媒数据整理"], out: "数据简报 + 改善建议" },
    { icon: "⚖️", color: C.red, name: "小法", role: "法务合规", duty: ["法规追踪与研判", "合规风险拦停", "产品红线审查"], out: "合规雷达 + 行动项" },
  ];

  roles.forEach((r, i) => {
    const x = 0.6 + i * 3.2;
    const y = 1.95;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 2.9, h: 4.75, rectRadius: 0.12, fill: { color: hex(C.white) }, line: { color: hex(C.lightGray), width: 1 }, shadow: { type: "outer", color: "BCC7D4", blur: 8, offset: 3, angle: 90, opacity: 0.3 } });
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 2.9, h: 1.05, rectRadius: 0.12, fill: { color: hex(r.color) } });
    s.addShape(pptx.ShapeType.rect, { x, y: y + 0.85, w: 2.9, h: 0.2, fill: { color: hex(r.color) } });
    s.addText(r.icon, { x, y: y + 0.1, w: 2.9, h: 0.6, fontSize: 30, align: "center" });
    s.addText(r.name, { x, y: y + 0.62, w: 2.9, h: 0.4, fontSize: 17, fontFace: F, color: hex(C.white), bold: true, align: "center" });
    s.addText(r.role, { x, y: y + 1.2, w: 2.9, h: 0.4, fontSize: 14, fontFace: F, color: hex(C.navy), bold: true, align: "center" });
    r.duty.forEach((d, j) => {
      s.addText(`•  ${d}`, { x: x + 0.25, y: y + 1.75 + j * 0.55, w: 2.5, h: 0.5, fontSize: 12, fontFace: F, color: hex(C.dark), valign: "middle" });
    });
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.25, y: y + 3.95, w: 2.4, h: 0.55, rectRadius: 0.08, fill: { color: hex(C.offWhite) }, line: { color: hex(r.color), width: 1 } });
    s.addText(r.out, { x: x + 0.25, y: y + 3.95, w: 2.4, h: 0.55, fontSize: 10.5, fontFace: F, color: hex(r.color), bold: true, align: "center", valign: "middle" });
  });
}

// ─── Slide 5: CEO Feedback ──────────────────────────────────
function addFeedback() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "CEO 的反馈与我们的采纳", "七条关键意见，已逐条写入作战室宪法");

  const items = [
    "小毕不限于研发/运维 → 升为执行总监，可调度管理 AI 专家团",
    "分阶段循序渐进 → Phase 1 先跑 5 个核心角色，跑顺再加",
    "决策格式要硬 → 每角色产出 = 建议 + 决策请求（给选项），不准开放式",
    "风险角色敢拦 → 法务/合规发现高危项主动预警拦停，不等日报",
    "数据接入先摸底 → 能自动就自动，不能的给 1 分钟粘贴模板",
    "渐进授权 → 磨合期多请示，有默契后扩大授权范围",
    "营销 IP 点子（多平台统一账号做专业 IP）→ 已纳入规划",
  ];

  items.forEach((it, i) => {
    const yBase = 1.95 + i * 0.68;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: yBase, w: 12.13, h: 0.58, rectRadius: 0.08, fill: { color: hex(C.white) }, line: { color: hex(C.lightGray), width: 1 } });
    s.addShape(pptx.ShapeType.ellipse, { x: 0.78, y: yBase + 0.09, w: 0.4, h: 0.4, fill: { color: hex(C.green) } });
    s.addText("✓", { x: 0.78, y: yBase + 0.09, w: 0.4, h: 0.4, fontSize: 14, color: hex(C.white), bold: true, align: "center", valign: "middle" });
    s.addText(it, { x: 1.4, y: yBase, w: 11.1, h: 0.58, fontSize: 13.5, fontFace: F, color: hex(C.dark), valign: "middle" });
  });
}

// ─── Slide 6: Daily Workflow ────────────────────────────────
function addWorkflow() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "协同工作流 — 每日作战室", "每天 07:00 自动触发，五步汇聚为一份战情简报");

  const steps = [
    { time: "07:00", title: "数据汇聚", desc: "小数拉取 Polar API\nVercel Analytics\n读取反馈汇总", color: C.blue },
    { time: "", title: "法务雷达", desc: "小法搜索最新\n法规动态\n合规缺口扫描", color: C.lightBlue },
    { time: "", title: "行销进展", desc: "小市回顾排期\n完成情况\n渠道效果复盘", color: C.amber },
    { time: "", title: "质量汇总", desc: "小Q检查待办\ni18n 对称\nbuild 状态", color: C.green },
    { time: "", title: "小毕整合", desc: "汇总优先级\n🔴需决策 / 🟡建议\n📊关键指标", color: C.navy },
  ];

  const cardW = 2.25, gap = 0.2, startX = 0.6, cardY = 2.0, cardH = 3.0;
  steps.forEach((st, i) => {
    const x = startX + i * (cardW + gap);
    if (i < steps.length - 1) {
      const ax = x + cardW + 0.02, ay = cardY + cardH / 2;
      s.addShape(pptx.ShapeType.chevron, { x: ax, y: ay - 0.18, w: 0.18, h: 0.36, fill: { color: hex(C.lightGray) } });
    }
    if (st.time) {
      s.addShape(pptx.ShapeType.roundRect, { x: x + 0.55, y: 1.45, w: 1.15, h: 0.42, rectRadius: 0.2, fill: { color: hex(C.navy) } });
      s.addText(st.time, { x: x + 0.55, y: 1.45, w: 1.15, h: 0.42, fontSize: 12, color: hex(C.white), bold: true, align: "center", valign: "middle", fontFace: F });
    }
    s.addShape(pptx.ShapeType.roundRect, { x, y: cardY, w: cardW, h: cardH, rectRadius: 0.1, fill: { color: hex(C.white) }, line: { color: hex(st.color), width: 2 }, shadow: { type: "outer", color: "BCC7D4", blur: 6, offset: 2, angle: 90, opacity: 0.3 } });
    s.addShape(pptx.ShapeType.ellipse, { x: x + cardW / 2 - 0.4, y: cardY + 0.22, w: 0.8, h: 0.8, fill: { color: hex(st.color) } });
    s.addText(String(i + 1), { x: x + cardW / 2 - 0.4, y: cardY + 0.22, w: 0.8, h: 0.8, fontSize: 24, color: hex(C.white), bold: true, align: "center", valign: "middle", fontFace: F });
    s.addText(st.title, { x, y: cardY + 1.15, w: cardW, h: 0.5, fontSize: 15, fontFace: F, color: hex(C.navy), bold: true, align: "center" });
    s.addText(st.desc, { x: x + 0.1, y: cardY + 1.7, w: cardW - 0.2, h: 1.2, fontSize: 11, fontFace: F, color: hex(C.gray), align: "center", valign: "top", lineSpacingMultiple: 1.15 });
  });

  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 5.35, w: 12.13, h: 1.45, rectRadius: 0.1, fill: { color: hex(C.navy) }, shadow: { type: "outer", color: "1E3A5F", blur: 8, offset: 2, angle: 90, opacity: 0.35 } });
  s.addText([
    { text: "Daily Brief 固定结构    ", options: { fontSize: 14, bold: true, color: hex(C.lightBlue) } },
    { text: "🔴 需决策（按紧急度，给选项A/B）   🟡 建议（可授权执行）   🟢 常态/已完成   📊 关键指标快照", options: { fontSize: 13.5, color: hex(C.white) } },
  ], { x: 0.85, y: 5.35, w: 11.6, h: 1.45, fontFace: F, align: "center", valign: "middle" });
}

// ─── Slide 7: Decision Format ───────────────────────────────
function addDecisionFormat() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "决策格式（硬约束）", "每个角色产出必须落到模板，CEO 只需 yes / no / 改方向");

  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 1.95, w: 7.7, h: 4.75, rectRadius: 0.12, fill: { color: hex(C.white) }, line: { color: hex(C.lightGray), width: 1 }, shadow: { type: "outer", color: "BCC7D4", blur: 8, offset: 3, angle: 90, opacity: 0.3 } });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 1.95, w: 7.7, h: 0.7, rectRadius: 0.12, fill: { color: hex(C.navy) } });
  s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.45, w: 7.7, h: 0.2, fill: { color: hex(C.navy) } });
  s.addText("每角色产出标准模板", { x: 0.6, y: 1.95, w: 7.7, h: 0.7, fontSize: 16, fontFace: F, color: hex(C.white), bold: true, align: "center", valign: "middle" });

  const lines = [
    { label: "建议：", text: "一句话可执行建议" },
    { label: "依据：", text: "数据 / 事实引用（标来源）" },
    { label: "选项A：", text: "做什么 + 代价 / 风险" },
    { label: "选项B：", text: "做什么 + 代价 / 风险" },
    { label: "推荐：", text: "A / B / 自定义" },
    { label: "需你审批：", text: "是 / 否" },
  ];
  lines.forEach((l, i) => {
    const yBase = 2.85 + i * 0.62;
    s.addText(l.label, { x: 0.95, y: yBase, w: 1.6, h: 0.5, fontSize: 14, fontFace: F, color: hex(C.blue), bold: true, valign: "middle" });
    s.addText(l.text, { x: 2.55, y: yBase, w: 5.5, h: 0.5, fontSize: 13, fontFace: F, color: hex(C.gray), valign: "middle" });
  });

  s.addShape(pptx.ShapeType.roundRect, { x: 8.6, y: 1.95, w: 4.13, h: 4.75, rectRadius: 0.12, fill: { color: hex(C.softBlue) }, line: { color: hex(C.lightBlue), width: 1.5 } });
  s.addText("核心原则", { x: 8.6, y: 2.15, w: 4.13, h: 0.5, fontSize: 16, fontFace: F, color: hex(C.blue), bold: true, align: "center" });
  const principles = ["不准开放式脑补", "每个产出必须带选项", "所有数据注明来源", "有证据才有建议", "不允许凭空想象", "决策请求给足信息", "CEO 只需 yes / no"];
  principles.forEach((p, i) => {
    s.addText(`●  ${p}`, { x: 8.9, y: 2.8 + i * 0.55, w: 3.6, h: 0.5, fontSize: 12.5, fontFace: F, color: hex(C.dark), valign: "middle" });
  });
}

// ─── Slide 8: Marketing IP ──────────────────────────────────
function addMarketingIP() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "营销 IP 规划（CEO 创意）", "多平台统一账号做专业 IP —— 教育市场 · 铺垫宣传 · 粉丝变现");

  const platforms = [
    { name: "微信公众号", icon: "💬", desc: "深度文章、教程\n合规解读、案例" },
    { name: "LINE", icon: "✉️", desc: "台湾市场\n即时资讯推送" },
    { name: "LinkedIn", icon: "💼", desc: "专业形象\n企业客户触达" },
    { name: "小红书", icon: "📕", desc: "图文笔记\n知识科普" },
    { name: "抖音", icon: "🎬", desc: "短视频\n热点借势" },
  ];
  platforms.forEach((p, i) => {
    const x = 0.6 + i * 2.45;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 2.15, w: 2.25, h: 3.0, rectRadius: 0.12, fill: { color: hex(C.white) }, line: { color: hex(C.lightGray), width: 1 }, shadow: { type: "outer", color: "BCC7D4", blur: 6, offset: 2, angle: 90, opacity: 0.3 } });
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.75, y: 2.4, w: 0.75, h: 0.75, fill: { color: hex(C.softBlue) } });
    s.addText(p.icon, { x: x + 0.75, y: 2.4, w: 0.75, h: 0.75, fontSize: 28, align: "center", valign: "middle" });
    s.addText(p.name, { x, y: 3.3, w: 2.25, h: 0.5, fontSize: 14, fontFace: F, color: hex(C.navy), bold: true, align: "center" });
    s.addText(p.desc, { x: x + 0.1, y: 3.85, w: 2.05, h: 1.2, fontSize: 11, fontFace: F, color: hex(C.gray), align: "center", valign: "top", lineSpacingMultiple: 1.15 });
  });

  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 5.5, w: 12.13, h: 1.15, rectRadius: 0.1, fill: { color: hex(C.softBlue) }, line: { color: hex(C.lightBlue), width: 1.5 } });
  s.addText([
    { text: "负责角色：", options: { fontSize: 13.5, bold: true, color: hex(C.blue) } },
    { text: "小市（市场行销牵头） + 小肖（推广增长，渠道策略支持）", options: { fontSize: 13.5, color: hex(C.dark) } },
    { text: "      |      待产出：", options: { fontSize: 13.5, color: hex(C.gray) } },
    { text: "账号规划方案 + 首批内容排期", options: { fontSize: 13.5, bold: true, color: hex(C.blue) } },
  ], { x: 0.85, y: 5.5, w: 11.6, h: 1.15, fontFace: F, align: "center", valign: "middle" });
}

// ─── Slide 9: Infrastructure ────────────────────────────────
function addInfrastructure() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "基建待办与下一步", "数据底座优先 —— 先摸底能自动拉什么，再决定人工模板");

  const items = [
    { status: "⏳", color: C.amber, title: "Polar API 数据调研", desc: "收入 / 订阅 / 客户清单 — 查清能拉到什么程度，出接入方案" },
    { status: "⏳", color: C.amber, title: "Vercel Analytics 接入", desc: "检查是否已启用；如未，给接入方案并提供 dashboard" },
    { status: "📋", color: C.gray, title: "社媒数据手动模板", desc: "小红书 / 知乎 / 抖音后台数据 → 设计 1 分钟粘贴模板" },
    { status: "📋", color: C.gray, title: "合规雷达首次扫描", desc: "对照《标识办法》+ EU AI Act → 产品功能对照表 → 缺口分析" },
    { status: "✅", color: C.green, title: "War-Room 自动化", desc: "每日 07:00 自动触发，产出 docs/war-room/YYYY-MM-DD.md" },
    { status: "✅", color: C.green, title: "Daily Brief 模板", desc: "四段结构模板已完成（🔴需决策 / 🟡建议 / 🟢常态 / 📊指标）" },
  ];
  items.forEach((it, i) => {
    const yBase = 1.95 + i * 0.78;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: yBase, w: 12.13, h: 0.68, rectRadius: 0.08, fill: { color: hex(C.white) }, line: { color: hex(C.lightGray), width: 1 } });
    s.addShape(pptx.ShapeType.roundRect, { x: 0.78, y: yBase + 0.14, w: 0.55, h: 0.4, rectRadius: 0.08, fill: { color: hex(it.color) } });
    s.addText(it.status, { x: 0.78, y: yBase + 0.14, w: 0.55, h: 0.4, fontSize: 15, align: "center", valign: "middle" });
    s.addText(it.title, { x: 1.55, y: yBase, w: 3.8, h: 0.68, fontSize: 15, fontFace: F, color: hex(C.navy), bold: true, valign: "middle" });
    s.addText(it.desc, { x: 5.4, y: yBase, w: 7.15, h: 0.68, fontSize: 12.5, fontFace: F, color: hex(C.gray), valign: "middle" });
  });
}

// ─── Slide 10: Execution Phases ─────────────────────────────
function addPhases() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.bg };
  header(s, "执行阶段规划", "渐进授权 —— 从多问少自动，到例行操作全自动");

  const phases = [
    { emoji: "⚡", title: "磨合期", period: "第 1–2 周", color: C.amber, desc: "角色产出 brief → CEO 决策 → 执行\n多问少自动，建立信任与默契", items: ["每周出 5 次 Daily Brief", "所有决策需 CEO 审批", "逐步调试角色 prompt"] },
    { emoji: "🔄", title: "默契期", period: "第 3–4 周", color: C.blue, desc: "日常动作可授权自动跑\n我懂您偏好，少问直接做", items: ["数据拉取自动", "报告生成自动", "低风险部署可授权"] },
    { emoji: "🤖", title: "高度授权", period: "4 周后", color: C.navy, desc: "例行操作全自动\nCEO 只审例外 + 重大方向", items: ["社媒自动排期发帖", "成本监控自动预警", "合规扫描自动报告"] },
  ];
  phases.forEach((p, i) => {
    const x = 0.6 + i * 4.1;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.95, w: 3.9, h: 4.75, rectRadius: 0.15, fill: { color: hex(C.white) }, line: { color: hex(p.color), width: 2 }, shadow: { type: "outer", color: "BCC7D4", blur: 8, offset: 3, angle: 90, opacity: 0.3 } });
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.95, w: 3.9, h: 1.25, rectRadius: 0.15, fill: { color: hex(p.color) } });
    s.addShape(pptx.ShapeType.rect, { x, y: 2.95, w: 3.9, h: 0.25, fill: { color: hex(p.color) } });
    s.addText(`${p.emoji}  ${p.title}`, { x, y: 2.0, w: 3.9, h: 0.65, fontSize: 19, fontFace: F, color: hex(C.white), bold: true, align: "center", valign: "middle" });
    s.addText(p.period, { x, y: 2.65, w: 3.9, h: 0.45, fontSize: 13, fontFace: F, color: hex(C.white), align: "center", valign: "middle" });
    s.addText(p.desc, { x: x + 0.25, y: 3.45, w: 3.4, h: 1.1, fontSize: 13, fontFace: F, color: hex(C.dark), align: "center", valign: "top", lineSpacingMultiple: 1.15 });
    p.items.forEach((item, j) => {
      s.addText(`•  ${item}`, { x: x + 0.3, y: 4.7 + j * 0.6, w: 3.3, h: 0.5, fontSize: 11.5, fontFace: F, color: hex(C.gray), valign: "middle" });
    });
  });
}

// ─── Slide 11: Thank You ────────────────────────────────────
function addThankYou() {
  const s = pptx.addSlide();
  s.background = { path: ASSET.hero };
  s.addImage({ path: ASSET.overlay, x: 0, y: 0, w: 13.333, h: 7.5 });
  s.addImage({ path: ASSET.lens, x: 6.16, y: 1.3, w: 1.0, h: 1.0 });

  s.addText("Thank You", { x: 0, y: 2.6, w: 13.333, h: 1.2, fontSize: 50, fontFace: F, color: hex(C.white), bold: true, align: "center", valign: "middle" });
  s.addShape(pptx.ShapeType.rect, { x: 5.66, y: 3.95, w: 2.0, h: 0.04, fill: { color: hex(C.lightBlue) } });
  s.addText("先跑起来，持续优化", { x: 0, y: 4.2, w: 13.333, h: 0.9, fontSize: 23, fontFace: F, color: hex(C.lightBlue), align: "center", valign: "middle" });
  s.addText("TrueLens War-Room   ·   v1.1   ·   2026 年 7 月", { x: 0, y: 6.1, w: 13.333, h: 0.5, fontSize: 12, fontFace: F, color: hex(C.lightGray), align: "center", valign: "middle" });
}

// ─── Build ──────────────────────────────────────────────────
addCover();
addBackground();
addOrgChart();
addRoleMatrix();
addFeedback();
addWorkflow();
addDecisionFormat();
addMarketingIP();
addInfrastructure();
addPhases();
addThankYou();

const outPath = "C:/Users/Michael/WorkBuddy/2026-07-16-10-54-35/TrueLens/docs/war-room/TrueLens-WarRoom-v1.1.pptx";
pptx.writeFile({ fileName: outPath })
  .then(() => console.log("✅ PPT saved:", outPath))
  .catch((err) => console.error("❌ Error:", err));
