# AI 水印检测器 · OCR 验证 & 校准报告

**日期**：2026-07-19
**目标**：用 OCR 建立"哪些测试图真的带 AI 水印文字"的真值，验证 `lib/detectors/aiWatermark.ts` 的纯 JS 启发式有没有漏判(FN)/误判(FP)，并据此校准。

---

## 1. 方法

- **OCR 引擎**：`tesseract.js@5.1.1`，**纯本地离线**（core 走 `tesseract.js-core` 本地 require，`langPath` 指向 `tests/tessdata/` 的 `eng.traineddata` + `chi_sim.traineddata`，不触网 —— Node 的 fetch 不读代理，故必须本地化）。
- **语言**：`eng` + `chi_sim` 双识别，合并文本后匹配水印关键词（`图片由AI生成` / `AI Generated` / `Made with AI` / `Midjourney` 等）。
- **AI 水印启发式**：把 `aiWatermark.ts` 逻辑**逐字移植**到 `tests/_wm_detect.mjs`（jimp 0.22.x，常量/阈值/硬门槛完全一致），对 17 图输出 `found/position/confidence/details`。
- **对照脚本**：`tests/_wm_report.mjs` 以 OCR 真值为基准，逐图分类 TP/FN/FP/TN。

> 注：这些 AI 图本身含大量"伪文字"，OCR 读出很花。因此除精确匹配外，额外做了**碎片级扫描**（匹配 `图片由`/`由AI`/`生成` 等残片），以修正 OCR 把"生成"误读成"二"导致的漏算。

---

## 2. OCR 真值（17 图）

| 图 | 期望 | 是否带水印文字 | 证据 |
|---|---|---|---|
| ai-food.jpg | ai | **是（确认）** | CHI 末尾「本 图 片 由 AI 生成」 |
| beach.png | ai | **是（高置信）** | CHI 出现「图 片 由 AI 二」（生成被误读），与 ai-food 同源水印 |
| 其余 15 张（含全部真实照） | — | 否 | 无 `图片由AI` / `AI Generated` 等残片 |

→ **真值：2 张带水印（均为 AI 图），15 张无。**

---

## 3. 检测器对照结果

| | 修复前 | 修复后（加位置先验） |
|---|---|---|
| TP（真水印且判出） | 0 | 0 |
| **FN（漏判：真水印却没判出）** | 1 | **2** |
| **FP（误判：干净照却误报）** | 1 | **0** ✅ |
| TN（干净且判干净） | 15 | 15 |

- **修复前**：`real-street.jpg`（真实照）被误报 `found:true`（命中在 **top-left**）；`ai-food.jpg` 真带水印却漏判。
- **修复后**：加入"仅底部区域算水印"的位置先验后，`real-street` 的 top-left 信号被排除 → **FP 归零，无回归**；但 2 张真带水印的 AI 图**仍全部漏判**。

---

## 4. 根因分析

**漏判（FN）—— 检测器抓不到真水印：**
- `ai-food.jpg`：最佳区域 score≈0.20（已过 0.15 阈值），但 `EDGE_GATE=0.04` 不通过（实测 edge=0.009）。水印是小号中文，`2×` 降采样后笔画边缘达不到 80 灰度梯度门槛 → 被判"非文字"。
- `beach.png`：最佳区域 bright=1.0（亮区）、edge=0.0 → 干脆没检测到文字边缘。
- **结论**：靠"文字笔画=锐利边缘"的硬门槛，对**小号/低对比/平滑**水印系统性失效。

**误判（FP）—— 干净真实照被误报：**
- `real-street.jpg`：真实街景照 top-left 有白色招牌文字，bright/edge/text 全过门槛 → 误判。
- 修复：真实 AI 水印几乎都在**底部**，加位置先验后直接排除 top 区域信号，FP 消除。

---

## 5. 校准决策

✅ **已实施（安全、零回归）**：位置先验 —— 仅 `bottom-*` 区域可判 `found:true`，top 区域文字信号一律不算水印。已写入 `lib/detectors/aiWatermark.ts`（并同步到 `tests/_wm_detect.mjs`）。

❌ **不建议：放松 `EDGE_GATE`/`TEXT_GATE` 去追漏判**。验证表明：把 `EDGE_GATE` 从 0.04 降到 0.008 虽能抓住 `ai-food`，但会让 `real-food.jpg`（真实照）变成**新 FP**。阈值调参是零和博弈，且当前带水印样本仅 2 张，不足以安全调参。

🎯 **推荐根本解法（后续）**：**OCR 短语匹配**作为权威水印信号 —— 在具备 OCR 能力的服务端、或对登录用户调用真实 OCR，直接匹配「图片由AI生成 / AI Generated / Made with AI」等短语。Vercel 端因无法稳定跑 OCR，保留现有像素启发式仅作**弱 hint**（目前代码已是 +30% 概率扰动、不单独翻案，故无安全隐患）。

---

## 6. 产物清单

- `tests/_wm_ocr.mjs` — 本地离线 OCR 脚本
- `tests/_wm_detect.mjs` — aiWatermark.ts 忠实移植 + 运行
- `tests/_wm_report.mjs` — 对照/校准报告生成
- `tests/_wm_ocr_out.json` / `_wm_detect_out.json` / `_wm_report_out.json` — 原始结果
- `tests/tessdata/` — 本地 `eng`/`chi_sim` traineddata（已 gitignore 风险：需确认是否入库；建议不入库，CI 时下载）
- `lib/detectors/aiWatermark.ts` — **已加位置先验修复（未 commit）**

---

## 7. 结论一句话

纯 JS 水印启发式在这组样本上**漏掉全部 2 张真水印（系统性 FN）**，仅靠位置先验消除了 1 个误报；它作为"弱 hint"尚可，但**不能作为抓 AI 水印的可靠手段**——真正的正解是 OCR 短语匹配。
