// TrueLens War-Room PDF v2.0 — PPT-image-based, landscape, Chinese bold
// Pipeline: SVG slides → resvg PNGs (2560×1440) → pdfkit PDF

import { Resvg } from "@resvg/resvg-js";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUT_DIR = "C:/Users/Michael/WorkBuddy/2026-07-16-10-54-35/TrueLens/docs/war-room";
const ASSETS_DIR = path.join(OUT_DIR, "assets");
const OUT_PDF = path.join(OUT_DIR, "TrueLens-WarRoom-v1.2.pdf");

// ─── Dimensions ────────────────────────────────────────────
const W = 2560;
const H = 1440;
const M = 100; // margin
const CW = W - M * 2; // content width

// ─── Colors ────────────────────────────────────────────────
const C = {
  navy: "#0E2A47",
  darkNavy: "#081B30",
  blue: "#185FA5",
  lightBlue: "#3B82F6",
  paleBlue: "#9CC3E6",
  white: "#FFFFFF",
  gray: "#94A3B8",
  lightGray: "#CBD5E1",
  amber: "#D97706",
  green: "#16A34A",
  red: "#DC2626",
  cardBg: "#0F2D4A",
  cardBorder: "#1E4D7B",
  accent: "#2563EB",
  softBg: "#F0F4F8",
};

// ─── Helpers ───────────────────────────────────────────────
function rect(x, y, w, h, fill, rx = 0) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${rx}" ${rx ? `ry="${rx}"` : ""}/>`;
}

function roundRect(x, y, w, h, fill, r = 12) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/>`;
}

function gradientBg(w, h, c1, c2, id = "bg") {
  return `<defs>
    <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.30"/>
    </filter>
    <filter id="softShadow" x="-3%" y="-3%" width="106%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.20"/>
    </filter>
  </defs>`;
}

function text(x, y, t, size = 16, color = C.white, weight = "normal", align = "start") {
  return `<text x="${x}" y="${y}" font-family="Microsoft YaHei" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${align}">${escapeXml(t)}</text>`;
}

function titleBar(y, title, subtitle = "") {
  let svg = `<rect x="0" y="${y}" width="${W}" height="110" fill="${C.darkNavy}"/>`;
  svg += text(100, y + 58, title, 38, C.white, "bold", "start");
  if (subtitle) svg += text(100, y + 88, subtitle, 18, C.paleBlue, "normal", "start");
  return svg;
}

function card(x, y, w, h, icon, title, desc, bg = C.cardBg) {
  let svg = roundRect(x, y, w, h, bg, 14);
  svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" ry="14" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;
  svg += text(x + 22, y + 38, icon, 24, C.white, "normal", "start");
  svg += text(x + 58, y + 38, title, 20, C.white, "bold", "start");
  // description as wrapped text — we'll do single-line for simplicity
  svg += text(x + 22, y + 72, desc, 15, C.lightGray, "normal", "start");
  return svg;
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ─── SVG wrappers ───────────────────────────────────────────
function svgWrap(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${gradientBg(W, H, C.navy, C.darkNavy)}
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)"/>
${inner}
</svg>`;
}

// Load hero image as base64
function loadHeroBase64() {
  const buf = fs.readFileSync(path.join(ASSETS_DIR, "cover-hero.png"));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ─── Slide builders ─────────────────────────────────────────

function slide01_Cover(heroBase64) {
  return svgWrap(`
    <image href="${heroBase64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0.55"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)" opacity="0.65"/>
    <line x1="100" y1="340" x2="500" y2="340" stroke="${C.blue}" stroke-width="3"/>
    <text x="100" y="300" font-family="Microsoft YaHei" font-size="54" font-weight="bold" fill="${C.white}">TrueLens War-Room</text>
    <text x="100" y="380" font-family="Microsoft YaHei" font-size="38" font-weight="bold" fill="${C.lightBlue}">多角色协同作战室方案</text>
    <text x="100" y="460" font-family="Microsoft YaHei" font-size="20" font-weight="normal" fill="${C.gray}">v1.0 · 2026 年 7 月</text>
    <rect x="100" y="520" width="400" height="1" fill="${C.gray}" opacity="0.3"/>
    <text x="100" y="560" font-family="Microsoft YaHei" font-size="16" font-weight="normal" fill="${C.paleBlue}">CEO — 小毕联手 · 2 人团队的大公司专业覆盖密度</text>
    <!-- bottom right branding -->
    <rect x="${W - 280}" y="${H - 80}" width="180" height="40" rx="8" fill="${C.blue}" opacity="0.3"/>
    <text x="${W - 190}" y="${H - 55}" font-family="Microsoft YaHei" font-size="14" font-weight="normal" fill="${C.paleBlue}" text-anchor="middle">truelens.top</text>
  `);
}

function slide02_Background() {
  const cards = [
    { icon: "👥", title: "团队现状", desc: "2 人合伙创业（CEO + 小毕），产品 v0.7.0 已上线 Polar 实收，反馈系统每日自动运行" },
    { icon: "⚠️", title: "痛点", desc: "法务/财务/合规/数据分析等专业视角空白，决策依赖个人脑补" },
    { icon: "🎯", title: "目标", desc: "用 AI 扮演多专业角色，让 2 人团队拥有大公司的专业覆盖密度" },
    { icon: "⚙️", title: "核心机制", desc: "小毕 = 执行总监，调度 AI 专家团每天产出 brief，你只需 yes/no/改方向" },
  ];
  let inner = titleBar(0, "背景与目标", "Background & Goals · Phase 1");
  const cardW = (CW - 40) / 2;
  const cardH = 170;
  const startY = 180;
  const positions = [
    [M, startY],
    [M + cardW + 40, startY],
    [M, startY + cardH + 30],
    [M + cardW + 40, startY + cardH + 30],
  ];
  cards.forEach((c, i) => {
    const [cx, cy] = positions[i];
    inner += card(cx, cy, cardW, cardH, c.icon, c.title, c.desc);
  });
  return svgWrap(inner);
}

function slide03_OrgStructure() {
  // Tree: CEO → 小毕(执行总监) → Phase 1 experts, Phase 2 dashed
  let inner = titleBar(0, "指挥架构", "Organizational Structure · Phase 1 + Future");

  // CEO box
  const ceoX = W / 2 - 100;
  inner += roundRect(ceoX, 170, 200, 65, C.blue, 10);
  inner += text(W / 2, 198, "CEO（Michael）", 24, C.white, "bold", "middle");
  inner += text(W / 2, 222, "决策 · 审批 · 方向", 13, C.paleBlue, "normal", "middle");

  // Vertical line from CEO
  inner += `<line x1="${W / 2}" y1="235" x2="${W / 2}" y2="270" stroke="${C.blue}" stroke-width="2"/>`;
  inner += `<line x1="${W / 2 - 400}" y1="270" x2="${W / 2 + 400}" y2="270" stroke="${C.blue}" stroke-width="2"/>`;

  // 小毕 box
  inner += `<line x1="${W / 2}" y1="270" x2="${W / 2}" y2="300" stroke="${C.blue}" stroke-width="2"/>`;
  inner += roundRect(ceoX, 300, 200, 65, C.amber, 10);
  inner += text(W / 2, 328, "小毕（执行总监）", 24, C.white, "bold", "middle");
  inner += text(W / 2, 352, "拆解 · 调度 · 整合 · 提决策", 13, C.paleBlue, "normal", "middle");

  // Horizontal line from 小毕 to Phase 1
  inner += `<line x1="${W / 2}" y1="365" x2="${W / 2}" y2="395" stroke="${C.blue}" stroke-width="2"/>`;
  inner += `<line x1="${W / 2 - 320}" y1="395" x2="${W / 2 + 320}" y2="395" stroke="${C.blue}" stroke-width="2"/>`;

  // Phase 1 experts - 4 boxes
  const experts = [
    { name: "小市", role: "市场行销", x: W / 2 - 290 },
    { name: "小Q", role: "质量验证", x: W / 2 - 100 },
    { name: "小数", role: "数据分析", x: W / 2 + 90 },
    { name: "小法", role: "法务合规", x: W / 2 + 250 },
  ];
  experts.forEach((e) => {
    inner += `<line x1="${e.x + 55}" y1="395" x2="${e.x + 55}" y2="425" stroke="${C.blue}" stroke-width="2"/>`;
    inner += roundRect(e.x, 425, 110, 70, C.cardBg, 8);
    inner += `<rect x="${e.x}" y="425" width="110" height="70" rx="8" ry="8" fill="none" stroke="${C.cardBorder}" stroke-width="1"/>`;
    inner += text(e.x + 55, 452, e.name, 20, C.white, "bold", "middle");
    inner += text(e.x + 55, 478, e.role, 12, C.lightGray, "normal", "middle");
  });

  // Phase 2 box (dashed)
  inner += `<rect x="${W / 2 - 430}" y="535" width="860" height="90" rx="12" ry="12" fill="none" stroke="${C.gray}" stroke-width="2" stroke-dasharray="8,6" opacity="0.5"/>`;
  inner += text(W / 2, 565, "Phase 2 待扩展：小肖（推广增长）· 小财（财务）· 小研（研发技术）…", 16, C.gray, "normal", "middle");
  inner += text(W / 2, 598, "分阶段循序渐进，先跑顺5个核心角色再加", 13, C.lightGray, "normal", "middle");

  // Phase 1 label
  inner += `<rect x="${W / 2 - 60}" y="506" width="120" height="28" rx="14" fill="${C.blue}" opacity="0.8"/>`;
  inner += text(W / 2, 525, "Phase 1", 13, C.white, "bold", "middle");

  return svgWrap(inner);
}

function slide04_Feedback() {
  const items = [
    { feedback: "小毕不限于研发/运维", adoption: "→ 升为执行总监，可调度管理 AI 专家团" },
    { feedback: "分阶段循序渐进", adoption: "→ Phase 1 先上 5 个核心角色，跑顺再加" },
    { feedback: "决策格式要硬", adoption: "→ 每角色产出落到\"建议 + 决策请求（给选项）\"" },
    { feedback: "风险角色要\"敢拦\"", adoption: "→ 法务/合规发现高危项主动预警拦停，不等日报" },
    { feedback: "数据接入先摸底", adoption: "→ 能自动就自动，不能的给 1 分钟粘贴模板" },
    { feedback: "渐进授权", adoption: "→ 磨合期多请示，有默契后扩大范围" },
    { feedback: "营销 IP 点子", adoption: "→ 多平台统一账号做专业 IP，纳入规划" },
  ];
  let inner = titleBar(0, "CEO 反馈与采纳", "Your Input · All 7 Points Adopted");
  let y = 175;
  inner += `<rect x="${M}" y="${y}" width="${CW}" height="1" fill="${C.cardBorder}" opacity="0.3"/>`;
  items.forEach((item, i) => {
    y += 30;
    inner += `<circle cx="${M + 15}" cy="${y + 5}" r="6" fill="${C.green}"/>`;
    inner += text(M + 35, y + 10, item.feedback, 18, C.white, "bold", "start");
    inner += text(M + 35, y + 36, item.adoption, 15, C.lightBlue, "normal", "start");
    y += 44;
    if (i < items.length - 1) {
      inner += `<line x1="${M}" y1="${y + 10}" x2="${M + CW}" y2="${y + 10}" stroke="${C.cardBorder}" stroke-width="1" opacity="0.15"/>`;
    }
  });
  return svgWrap(inner);
}

function slide05_Workflow() {
  let inner = titleBar(0, "每日作战室流程", "Daily War-Room · 07:00 AM BJT");

  const steps = [
    { n: "①", title: "数据汇聚", desc: "小数：拉 Polar API +\nVercel 流量", x: M },
    { n: "②", title: "法务雷达", desc: "小法：搜《标识办法》\n+ EU AI Act 动态", x: M + (CW - 4 * 40) / 5 + 40 },
    { n: "③", title: "行销回顾", desc: "小市：社媒进展 +\n热点借势建议", x: M + (CW - 4 * 40) / 5 * 2 + 80 },
    { n: "④", title: "质量汇总", desc: "小Q：代码状态 +\nbuild 检查 + 校对", x: M + (CW - 4 * 40) / 5 * 3 + 120 },
    { n: "⑤", title: "小毕整合", desc: "执行总监：汇总成\nDaily Brief 提决策", x: M + (CW - 4 * 40) / 5 * 4 + 160 },
  ];
  const stepW = (CW - 40 * 4) / 5; // ~400px per step

  // Draw flow arrows
  steps.forEach((s, i) => {
    inner += roundRect(s.x, 210, stepW, 180, C.cardBg, 14);
    inner += `<rect x="${s.x}" y="210" width="${stepW}" height="180" rx="14" ry="14" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;
    // Number circle
    inner += `<circle cx="${s.x + stepW / 2}" cy="${252}" r="24" fill="${C.blue}"/>`;
    inner += text(s.x + stepW / 2, 260, s.n, 20, C.white, "bold", "middle");
    // Title
    inner += text(s.x + stepW / 2, 308, s.title, 20, C.white, "bold", "middle");
    // Description (multi-line handled by \n)
    const lines = s.desc.split("\n");
    lines.forEach((line, li) => {
      inner += text(s.x + stepW / 2, 340 + li * 22, line, 13, C.lightGray, "normal", "middle");
    });
    // Arrow between steps
    if (i < steps.length - 1) {
      const arrowX = s.x + stepW + 8;
      inner += `<line x1="${arrowX}" y1="300" x2="${arrowX + 24}" y2="300" stroke="${C.blue}" stroke-width="2"/>`;
      inner += `<polygon points="${arrowX + 24},294 ${arrowX + 32},300 ${arrowX + 24},306" fill="${C.blue}"/>`;
    }
  });

  // Bottom: Brief template
  inner += roundRect(M, 460, CW, 120, C.cardBg, 14);
  inner += `<rect x="${M}" y="460" width="${CW}" height="120" rx="14" ry="14" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;
  inner += text(M + 30, 498, "Daily Brief 标准四段结构", 20, C.white, "bold", "start");
  const segments = ["🔴 需决策（给选项A/B）", "🟡 建议（可授权执行）", "🟢 常态 / 已完成", "📊 关键指标快照"];
  segments.forEach((seg, i) => {
    const segX = M + 30 + i * (CW - 60) / segments.length;
    inner += text(segX + (CW - 60) / segments.length / 2, 545, seg, 15, C.lightBlue, "normal", "middle");
  });
  // vertical dividers
  for (let i = 1; i < segments.length; i++) {
    const dx = M + 30 + i * (CW - 60) / segments.length;
    inner += `<line x1="${dx}" y1="488" x2="${dx}" y2="560" stroke="${C.cardBorder}" stroke-width="1" opacity="0.4"/>`;
  }

  // Automation badge
  inner += `<rect x="${W - 230}" y="144" width="130" height="30" rx="15" fill="${C.green}" opacity="0.85"/>`;
  inner += text(W - 165, 164, "✅ 每日 07:00 自动", 13, C.white, "bold", "middle");

  return svgWrap(inner);
}

function slide06_DecisionFormat() {
  let inner = titleBar(0, "决策格式——硬约束", "Decision Format Standards · Every Output Follows This Template");
  // Template card
  const tx = M + 50;
  const ty = 200;
  inner += roundRect(tx, ty, 600, 420, C.cardBg, 14);
  inner += `<rect x="${tx}" y="${ty}" width="600" height="420" rx="14" ry="14" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;
  inner += text(tx + 30, ty + 40, "每个角色产出标准模板", 22, C.white, "bold", "start");
  inner += `<line x1="${tx + 30}" y1="${ty + 55}" x2="${tx + 570}" y2="${ty + 55}" stroke="${C.cardBorder}" stroke-width="1" opacity="0.3"/>`;
  const templateLines = [
    { label: "建议：", content: "[一句话建议]", color: C.lightBlue },
    { label: "依据：", content: "[数据/事实引用，不写空话]", color: C.white },
    { label: "选项 A：", content: "[做什么 + 代价]", color: C.paleBlue },
    { label: "选项 B：", content: "[做什么 + 代价]", color: C.paleBlue },
    { label: "我的推荐：", content: "[A / B / 自定义]", color: C.green },
    { label: "需你审批：", content: "[是 / 否]", color: C.amber },
  ];
  templateLines.forEach((line, i) => {
    const ly = ty + 85 + i * 48;
    inner += text(tx + 35, ly, line.label, 17, line.color, "bold", "start");
    inner += text(tx + 150, ly, line.content, 17, C.lightGray, "normal", "start");
    if (i < templateLines.length - 1) {
      inner += `<line x1="${tx + 35}" y1="${ly + 30}" x2="${tx + 565}" y2="${ly + 30}" stroke="${C.cardBorder}" stroke-width="1" opacity="0.1"/>`;
    }
  });

  // Right side: principles
  const rx = tx + 680;
  inner += roundRect(rx, ty, 480, 420, C.cardBg, 14);
  inner += `<rect x="${rx}" y="${ty}" width="480" height="420" rx="14" ry="14" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;
  inner += text(rx + 30, ty + 40, "核心原则", 22, C.white, "bold", "start");
  inner += `<line x1="${rx + 30}" y1="${ty + 55}" x2="${rx + 450}" y2="${ty + 55}" stroke="${C.cardBorder}" stroke-width="1" opacity="0.3"/>`;
  const principles = [
    "✅ 禁止开放式脑暴——每项产出必须有结论",
    "✅ 决策请求必须给选项（≥2），不准空手要答案",
    "✅ 有证据才有建议——所有数据注明来源",
    "✅ 法务/合规发现高危项，不等日报直接拦停",
    "✅ 无变化就诚实说\"无新数据\"，不硬编",
  ];
  principles.forEach((p, i) => {
    inner += text(rx + 35, ty + 95 + i * 60, p, 16, C.lightGray, "normal", "start");
  });

  return svgWrap(inner);
}

function slide07_MarketingIP() {
  let inner = titleBar(0, "营销 IP 规划", "Multi-Platform Unified Brand — CEO's Creative Vision");

  // Left: Platforms
  const platforms = [
    { name: "微信公众号", icon: "📱", desc: "深度文章 · AI 检测科普 · 合规教育" },
    { name: "小红书 (RED)", icon: "📕", desc: "图文教程 · Before/After 案例 · 真实测评" },
    { name: "抖音/TikTok", icon: "🎬", desc: "短视频 · 深度伪造警示 · 快速检测 Demo" },
    { name: "LinkedIn", icon: "💼", desc: "专业内容 · 合规洞察 · 行业白皮书" },
    { name: "LINE (台湾)", icon: "💬", desc: "本地化 · 繁体中文 · 日本/台湾市场" },
  ];
  platforms.forEach((p, i) => {
    const py = 190 + i * 78;
    inner += roundRect(M, py, 700, 65, C.cardBg, 12);
    inner += `<rect x="${M}" y="${py}" width="700" height="65" rx="12" ry="12" fill="none" stroke="${C.cardBorder}" stroke-width="1"/>`;
    inner += text(M + 25, py + 25, p.icon, 22, C.white, "normal", "start");
    inner += text(M + 65, py + 25, p.name, 18, C.white, "bold", "start");
    inner += text(M + 65, py + 48, p.desc, 14, C.lightGray, "normal", "start");
  });

  // Right: Content direction card
  const rx = M + 780;
  inner += roundRect(rx, 190, 520, 370, C.cardBg, 14);
  inner += `<rect x="${rx}" y="190" width="520" height="370" rx="14" ry="14" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;
  inner += text(rx + 30, 228, "内容方向", 22, C.white, "bold", "start");
  inner += `<line x1="${rx + 30}" y1="248" x2="${rx + 490}" y2="248" stroke="${C.cardBorder}" stroke-width="1" opacity="0.3"/>`;
  const dirs = [
    { phase: "🎯 教育期", desc: "AI 检测知识科普 + 法规解读 → 建立认知" },
    { phase: "📣 铺垫期", desc: "标杆案例 + 测评对比 → 铺垫信任" },
    { phase: "🏆 转化期", desc: "产品导流 + 免费试用 → 获取用户" },
    { phase: "💰 变现期", desc: "粉丝经济 → 订阅/广告/内容付费" },
  ];
  dirs.forEach((d, i) => {
    const dy = 270 + i * 65;
    inner += text(rx + 35, dy, d.phase, 16, C.lightBlue, "bold", "start");
    inner += text(rx + 35, dy + 28, d.desc, 14, C.lightGray, "normal", "start");
  });

  // Bottom: Responsible
  inner += roundRect(M, 590, CW, 60, C.cardBg, 12);
  inner += `<rect x="${M}" y="590" width="${CW}" height="60" rx="12" ry="12" fill="none" stroke="${C.cardBorder}" stroke-width="1"/>`;
  inner += text(W / 2, 625, "牵头角色：小市（市场行销）+ 小肖（渠道策略）· 由 CEO 创意启发", 17, C.white, "normal", "middle");

  return svgWrap(inner);
}

function slide08_Infrastructure() {
  let inner = titleBar(0, "基建待办", "Infrastructure Backlog · In Progress & Completed");

  const todos = [
    { status: "⏳", label: "调研 Polar API", desc: "收入/订阅/客户数据范围确认", color: C.amber },
    { status: "⏳", label: "调研 Vercel Analytics", desc: "网站流量/事件追踪接入方案", color: C.amber },
    { status: "⏳", label: "社媒数据模板", desc: "1 分钟粘贴模板，外卖数据快速输入", color: C.amber },
    { status: "⏳", label: "合规雷达首扫", desc: "中国《标识办法》+ EU AI Act 最新动态", color: C.amber },
    { status: "✅", label: "War-Room 自动化", desc: "每日 07:00 自动运行，产出 Daily Brief", color: C.green },
    { status: "✅", label: "决策模板定稿", desc: "五角色统一产出格式已发布", color: C.green },
  ];

  const todoY = 190;
  const colW = (CW - 20) / 2;
  let leftItems = todos.slice(0, 3);
  let rightItems = todos.slice(3);

  function renderTodoList(arr, offsetX) {
    let svg = "";
    arr.forEach((item, i) => {
      const ty = todoY + i * 95;
      svg += roundRect(offsetX, ty, colW, 78, C.cardBg, 12);
      svg += `<rect x="${offsetX}" y="${ty}" width="${colW}" height="78" rx="12" ry="12" fill="none" stroke="${C.cardBorder}" stroke-width="1"/>`;
      svg += text(offsetX + 20, ty + 30, item.status, 20, item.color, "normal", "start");
      svg += text(offsetX + 65, ty + 30, item.label, 18, C.white, "bold", "start");
      svg += text(offsetX + 65, ty + 56, item.desc, 14, C.lightGray, "normal", "start");
    });
    return svg;
  }

  inner += renderTodoList(leftItems, M);
  inner += renderTodoList(rightItems, M + colW + 20);

  // Bottom summary bar
  inner += roundRect(M, 530, CW, 70, C.cardBg, 14);
  inner += `<rect x="${M}" y="530" width="${CW}" height="70" rx="14" ry="14" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;
  inner += text(M + 30, 560, "3 ⏳ 在建  |  2 ✅ 已完成  |  首单项：数据底座评估报告", 18, C.white, "normal", "start");
  inner += text(M + 30, 583, "优先级：小数（数据底座）→ 小法（合规雷达）→ 小市（营销 IP 方案）", 14, C.lightGray, "normal", "start");

  return svgWrap(inner);
}

function slide09_ExecutionPhases() {
  let inner = titleBar(0, "执行阶段规划", "Progressive Autonomy · 3 Phases");

  const phases = [
    { n: "⚡", title: "磨合期", period: "当前阶段", desc1: "角色产出 brief → CEO 决策 → 小毕执行", desc2: "数据收集/分析/建议全自动，发帖/部署/花钱类请示", desc3: "多问少自动，建立默契", color: C.amber },
    { n: "🔄", title: "默契期", period: "2–4 周后", desc1: "日常动作可授权自动执行", desc2: "数据拉取 / 报告生成 / 法务扫描自动跑", desc3: "CEO 只审例外 + 方向性决策", color: C.lightBlue },
    { n: "🤖", title: "高度授权", period: "更远", desc1: "例行操作全自动，CEO 聚焦战略", desc2: "角色可自动发帖/回应用户/部署", desc3: "CEO 每月战略审查", color: C.green },
  ];

  const phaseW = (CW - 60) / 3;
  phases.forEach((p, i) => {
    const px = M + i * (phaseW + 30);
    // Phase card
    inner += roundRect(px, 200, phaseW, 360, C.cardBg, 16);
    inner += `<rect x="${px}" y="200" width="${phaseW}" height="360" rx="16" ry="16" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;
    // Top accent line
    inner += `<rect x="${px}" y="200" width="${phaseW}" height="6" rx="3" fill="${p.color}"/>`;
    // Icon
    inner += text(px + phaseW / 2, 250, p.n, 36, C.white, "normal", "middle");
    // Title
    inner += text(px + phaseW / 2, 295, p.title, 24, C.white, "bold", "middle");
    // Period badge
    inner += `<rect x="${px + phaseW / 2 - 50}" y="310" width="100" height="24" rx="12" fill="${p.color}" opacity="0.2"/>`;
    inner += text(px + phaseW / 2, 327, p.period, 12, p.color, "bold", "middle");
    // Separator
    const sepY = 345;
    inner += `<line x1="${px + 25}" y1="${sepY}" x2="${px + phaseW - 25}" y2="${sepY}" stroke="${C.cardBorder}" stroke-width="1" opacity="0.3"/>`;
    // Descriptions
    inner += text(px + 25, 370, "● " + p.desc1, 14, C.lightGray, "normal", "start");
    inner += text(px + 25, 400, "● " + p.desc2, 14, C.lightGray, "normal", "start");
    inner += text(px + 25, 430, "● " + p.desc3, 14, C.lightGray, "normal", "start");
  });

  // Bottom summary
  inner += roundRect(M, 600, CW, 70, C.cardBg, 14);
  inner += text(W / 2, 636, "关键原则：先建立信任 → 再扩大授权 → 最终让 CEO 聚焦战略，而不是被琐事淹没", 16, C.white, "normal", "middle");
  inner += `<rect x="${M}" y="600" width="${CW}" height="70" rx="14" ry="14" fill="none" stroke="${C.cardBorder}" stroke-width="1.5"/>`;

  return svgWrap(inner);
}

function slide10_ThankYou(heroBase64) {
  return svgWrap(`
    <image href="${heroBase64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0.35"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)" opacity="0.50"/>
    <text x="${W / 2}" y="${H / 2 - 30}" font-family="Microsoft YaHei" font-size="56" font-weight="bold" fill="${C.white}" text-anchor="middle">Thank You</text>
    <text x="${W / 2}" y="${H / 2 + 40}" font-family="Microsoft YaHei" font-size="24" font-weight="normal" fill="${C.paleBlue}" text-anchor="middle">先跑起来，持续优化 🔄</text>
    <line x1="${W / 2 - 120}" y1="${H / 2 + 80}" x2="${W / 2 + 120}" y2="${H / 2 + 80}" stroke="${C.blue}" stroke-width="2"/>
    <text x="${W / 2}" y="${H / 2 + 130}" font-family="Microsoft YaHei" font-size="16" font-weight="normal" fill="${C.gray}" text-anchor="middle">TrueLens War-Room v1.0 · 2026 年 7 月</text>
  `);
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log("Loading hero image...");
  const heroBase64 = loadHeroBase64();
  console.log("Hero loaded:", Math.round(heroBase64.length / 1024), "KB");

  const slides = [
    slide01_Cover(heroBase64),
    slide02_Background(),
    slide03_OrgStructure(),
    slide04_Feedback(),
    slide05_Workflow(),
    slide06_DecisionFormat(),
    slide07_MarketingIP(),
    slide08_Infrastructure(),
    slide09_ExecutionPhases(),
    slide10_ThankYou(heroBase64),
  ];

  console.log(`Rendering ${slides.length} slides at ${W}×${H}...`);

  const pngBuffers = [];
  for (let i = 0; i < slides.length; i++) {
    const svg = slides[i];
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: W },
      font: { loadSystemFonts: true },
    });
    const rendered = resvg.render();
    const pngBuf = rendered.asPng();
    pngBuffers.push(pngBuf);
    console.log(`  Slide ${i + 1}/${slides.length}: ${Math.round(pngBuf.length / 1024)} KB`);
  }

  console.log("Building PDF...");
  const outPath = OUT_PDF;
  const doc = new PDFDocument({
    size: [W, H],
    margin: 0,
    info: {
      Title: "TrueLens War-Room v1.2",
      Author: "TrueLens War-Room",
      Subject: "多角色协同作战室方案（PDF 图片版）",
    },
  });
  const writeStream = fs.createWriteStream(outPath);
  doc.pipe(writeStream);

  pngBuffers.forEach((buf, i) => {
    if (i > 0) doc.addPage({ size: [W, H], margin: 0 });
    doc.image(buf, 0, 0, { width: W, height: H });
    console.log(`  PDF page ${i + 1} added`);
  });

  doc.end();
  await new Promise((resolve) => writeStream.on("finish", resolve));
  console.log(`\n✅ PDF saved: ${outPath}`);
  console.log(`   Size: ${Math.round(fs.statSync(outPath).size / 1024)} KB`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
