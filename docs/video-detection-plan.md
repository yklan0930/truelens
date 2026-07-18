# TrueLens 视频深伪 / AI 视频检测 — 架构与落地方案

> 调研日期：2026-07-18
> 范围：READ-ONLY 调研 + 实施方案（不改动主仓库代码）
> 目标：在现有图片检测产品（Next.js 14 + Vercel + Prisma/Postgres）上新增**视频** AI 生成 / 深伪检测能力

---

## 0. TL;DR（结论先讲）

- **视频推理绝对不能跑在 Vercel 函数里**：硬限制是请求/响应 body 上限 **4.5 MB**，且没有 GPU、最长 300s（Hobby）/ 800s（Pro）。视频文件远超 4.5 MB，连上传都过不去，更别提推理。
- **推荐主路径（PRIMARY）**：用第三方视频检测 **API（首选 Sightengine AI Video Detection）**，采用「浏览器直传对象存储 → Vercel 路由只发小 JSON 触发异步任务 → 提供商回调/webhook 回写结果 → 前端轮询」的架构。**视频数据永不经过 Vercel 函数**，完美绕开 4.5 MB 限制。
- **推荐备选（FALLBACK）**：自托管开源模型 **ACE-deepfake-detector / DFD-FCG**，跑在 **Modal（serverless GPU，按秒计费，冷启动）** 上的 FastAPI worker，同样的异步任务模式。用于降本、去依赖、或处理 >500 MB 的视频。
- **不要**在 MVP 阶段自训模型或碰 Microsoft Video Authenticator / Google "DeepFakeDetect"（前者不对公众开放 API，后者本质不存在独立的检测 API，SynthID 是水印而非检测）。

---

## 1. 引擎 / API 选项对比（2026 实测事实）

### 1.1 开源 / 自托管

| 项目 | 技术 | 成熟度 | 准确率 | 是否需 GPU 长驻 | 输入限制 | 延迟 |
|---|---|---|---|---|---|---|
| **ACE-deepfake-detector** | Xception + 迁移学习，支持 `predict_image/predict_video`，混合池化做视频帧一致性 | 中等，社区维护 | 文献级（FaceForensics++ 系 ~90%+），实际泛化需自测 | **是**，需 Python/PyTorch + GPU | 自行限制；长视频需抽帧 | 抽帧+推理，分钟级 |
| **DFD-FCG (CVPR'25)** | 基于基础模型 + 人脸部件引导适配 | 较新，研究级 | 跨数据集泛化 SOTA（需配权重，仅研究许可） | 是，~10 GB VRAM@batch30 | 同上 | 分钟级 |
| **STIL (时空不一致)** | 时空不一致模块，可插拔 2D CNN | 论文级 | DFDC 98.7% / FF++ 97.2% | 是 | 同上 | 分钟级 |

**结论**：开源模型**准确且免费，但必须跑在 GPU 上**，不适合塞进 Vercel。只适合作为「备用引擎」或成本失控时的退路，用 Modal/RunPod 承载。

### 1.2 付费 API

| 服务 | 准确率（视频） | 定价（2026 实测） | 输入限制 | 延迟 / 模式 | 是否适合我们 |
|---|---|---|---|---|---|
| **Sightengine AI Video Detection** ⭐ | 高（商业级，未公开单测但多模型集成） | 免费 2000 ops/月；Starter **$29/月=1万 ops**；Pro $99/月=4万 ops。每个深伪检测扣 **5 ops** → 约 **$0.0725/次** | 免费/Starter 单视频 **≤50 MB**，Pro **≤500 MB**；支持 Upload API + 回调 URL | **异步** + webhook 回调；视频帧率 0.5–2 fps；并发任务 Starter 1 / Pro 5 | **✅ 首选**：有直传 Upload API（绕开 4.5MB 限制）、异步回调、开发者友好、SDK 全 |
| **Hive Moderation** | 视频深伪 ~82%（aidetector 基准）/ 95.8%（Global 100 独立测试） | $50 免费 dev 额度；按调用计费约 $0.001/图；视频需联系销售或 dev 计划 | 需确认；以 URL/直传为主 | 请求-响应为主，视频可能需等数分钟 | ✅ 备选首选：API 最干净、文档好、多模态 |
| **Deepware Scanner** | ~91–93%（Global 100） | 网页 + **公开 API 免费** | **>10 分钟视频不支持**；URL/上传 | 2–4 分钟出结果；无音频检测 | ⚠️ 仅作免费兜底/三审，不够稳 |
| **Resemble Detect** | 优秀（音视频双通道） | **$0.07/秒视频**（pay-as-you-go） | 取决于上传 | **异步轮询** | 🟡 适合含音频的深伪，但按秒计费在长视频上偏贵 |
| **Reality Defender** | 98.5%（付费档） | 免费 50 次/月；$0.05/图；企业定价 | 全模态 | 异步 API + SDK | 🟡 最准但贵，企业向 |
| **Microsoft Video Authenticator** | 中（像素级边界失真） | **无公开独立 API**，仅集成进 MS 生态/特定合作方 | - | - | ❌ 不可集成 |
| **Google "DeepFakeDetect"** | - | **不存在独立检测 API**；Google 走的是 SynthID 水印（生成侧），不是检测侧 | - | - | ❌ 不可作为检测引擎 |
| **Intel FakeCatcher** | 96%（PPG 血流信号） | 仅企业授权，无公开 API | 需正脸 | 实时 | ❌ 不开放 |

**为何选 Sightengine 做 PRIMARY**：
1. 它有独立的 **Upload API**（先传文件拿 `media id`，再提交检测）——这意味着视频**根本不需要经过 Vercel 函数**，直接由浏览器/worker 上传到 Sightengine，彻底规避 4.5 MB body 限制。
2. 原生**异步 + 回调 URL（webhook）**，天然匹配「触发即返回、结果后推」的 serverless 友好模式。
3. 免费层 2000 ops/月 ≈ **400 次免费视频检测**，足够 MVP 验证；付费起点低（$29/月）。
4. 返回结构化 JSON（逐段置信度、人脸框、合成引擎线索），可复用现有 `evidence` 展示结构。

> 备选 PRIMARY 可用 **Hive**（集成最干净、多模态），但 Hive 视频以同步等待为主、时长不可控，更适合用「前端轮询 + Hive 任务 ID」而非 webhook。若团队更看重 Hive 的跨模态统一账单，可二选一，本方案以 Sightengine 为默认。

---

## 2. Vercel 约束现实核查

| 约束 | 数值（2026） | 对视频检测的影响 |
|---|---|---|
| 请求/响应 body 上限 | **4.5 MB** | 视频（常 10–500 MB）**无法**通过函数上传/下载 |
| 最大时长 | Hobby 300s（默认+上限）；Pro 300s 默认 / 可配到 800s；Enterprise 1800s(beta) | 即使能上传，分钟级视频推理也会超时 |
| 最大内存 | Hobby 2 GB；Pro 4 GB | 装不下视频帧缓冲 + 模型权重 |
| GPU | **无** | 重模型（Xception/DFD-FCG）完全跑不了 |
| 区域 | 默认单区域（iad1） | 长任务无法多区域分担 |

**结论**：Vercel 函数只能做「编排层」（鉴权、配额、建任务、收 webhook、轮询状态），**推理必须外移**。

### 推荐的三条现实架构路径

- **(a) 专用 GPU Worker（FastAPI on RunPod/Modal）**：完全自控，但需自己运维推理服务、处理冷启动、抽帧逻辑、错误重试。**成本最低但工程最重。**
- **(b) 直接调第三方 API（Sightengine/Hive）**：**工程最轻、最快上线、无需 GPU 服务器**。仅承担按量 API 费。
- **(c) 队列 + 异步（上传 → 任务 → 轮询）**：这是 **(a)/(b) 都必须采用的调用形态**，因为视频推理不是「请求-响应」能完成的。

**最终推荐**：
- **PRIMARY = (b) + (c)**：Vercel 编排层 + Sightengine 异步 API（直传 + webhook）。
- **FALLBACK = (a) + (c)**：同一套编排层 + Modal 上的开源模型 worker（当 Sightengine 成本或依赖性不可接受、或视频 >500 MB 时切换）。
- 两条路径共用同一套「任务表 + webhook + 轮询」骨架，切换引擎只需换 `engine` 字段与一处调用封装。

---

## 3. 为 TrueLens 提出的目标架构

### 3.1 整体数据流

```
浏览器
  │ 1. POST /api/detect-video/prepare  → 返回 Vercel Blob 签名上传 URL（小 JSON）
  │ 2. 直传视频到 Blob（绕开 4.5MB 限制，支持 GB 级）
  │ 3. POST /api/detect-video { blobUrl, fileName, ... }
  ▼
Vercel 函数（仅小 JSON，秒级返回）
  ├─ 鉴权 + 配额检查（复用现有逻辑）
  ├─ 建 VideoJob 行（status=pending）
  ├─ 调 Sightengine 异步接口（传 blobUrl + webhook 回调地址）
  └─ 返回 { jobId } 给前端
  ▼
前端轮询 GET /api/detect-video/status?jobId=xxx（每 3–5s）
  ▼
Sightengine 处理完 → POST /api/detect-video/webhook（Vercel 函数）
  ├─ 校验签名（shared secret / HMAC）
  ├─ 更新 VideoJob（status=done, result=...）
  └─ （可选）写 detection_history
  ▼
前端下次轮询拿到结果 → 展示概率 + 证据面板
```

> 关键点：**视频文件只走 `浏览器 → Blob → Sightengine`**，Vercel 函数全程只碰小 JSON 和 URL，永不触碰视频字节。

### 3.2 与现有系统的集成

- **复用现有鉴权/配额**：照搬 `app/api/detect/route.ts:168-233` 的 `auth()` + `UsageRecord` 日限额逻辑。图片档位：匿名 1 / 免费 5 / Pro 50。视频更重，建议**单独配额**：匿名 1 / 免费 3 / Pro 20 / Business 不限（在 `plan` 中区分）。
- **数据模型扩展**（Prisma，新增，不破坏现有表）：
  - 新增 `VideoJob` 表：`id, userId?, blobUrl, fileName, status(pending|processing|done|failed), engine(sightengine|modal), result Json?, error?, createdAt, updatedAt`。
  - `UsageRecord` 复用为日计数；或在 `UsageRecord` 加 `kind` 字段（`image|video`）做区分计数（推荐用新表 `VideoUsageRecord` 更清晰，避免迁移现有唯一约束）。
  - `DetectionHistory` 可复用，新增 `mediaType` 字段（`image|video`）区分；或新建 `VideoDetectionHistory`。
- **付费墙**：与图片一致——免费/匿名只回「概率 + 判定」，详细 `evidence`（逐段置信度、人脸框、生成引擎线索）仅 Pro/Business/Admin 可见（服务端裁剪，参考 `route.ts:247-251`）。

### 3.3 成本估算（月度）

| 规模 | 假设 | Sightengine 用量 | 月成本 |
|---|---|---|---|
| 100 用户 | 人均 5 次视频 = 500 次 | 500 × 5 ops = 2500 ops | 免费层 2000 + 溢出 500 ops ≈ **$0–$29**（Starter 封顶） |
| 1000 用户 | 人均 5 次 = 5000 次 | 5000 × 5 = 25000 ops | **$29–$99**（Starter 溢出或 Pro） |
| 10000 用户 | 人均 5 次 = 50000 次 | 250000 ops | **$99 + 溢出**（Pro 起，或谈企业价） |

> 对比 FALLBACK（Modal GPU）：A10G ~$0.60/小时，1 分钟视频推理约 10–60s GPU 时间 ≈ **$0.002–$0.01/视频**。在 >2 万次/月时自托管更省，但需承担开发与运维。MVP 阶段用 Sightengine 即可。

### 3.4 前端上传体验差异（vs 图片）

| 维度 | 图片（现有） | 视频（新增） |
|---|---|---|
| 交互 | 同步：上传→立即等结果 | **异步**：上传→任务进度→轮询→结果 |
| 进度 | loading 动画 | 真实进度条（Blob 上传进度 + "排队中/分析中"状态） |
| 超时 | 30s 内 | 可能 1–5 分钟，需「稍后回来查看」或站内通知 |
| 大小限制 | 10 MB | 建议前端先压到 ≤100 MB；Sightengine 免费/Starter ≤50 MB，Pro ≤500 MB |
| 历史 | localStorage | 服务端 `VideoJob`/`VideoDetectionHistory`（跨设备） |

---

## 4. 分阶段计划（可落地、按文件列出）

### Phase 0 — 技术验证（1–2 天，先别写业务代码）
- [ ] 注册 Sightengine 账号，拿到 `api_user` / `api_secret`；用其 Upload API + `video/check.json`（含 `models=genai-video`）跑通一个本地脚本。
- [ ] 验证：直传一个 ≤50 MB 视频 → 拿到 `media id` → 提交检测 → 收到回调 JSON 结构。
- [ ] 实测准确率：准备 10 段真视频 + 10 段 AI 视频（Sora/Runway/Veo 各若干），记录假阳/假阴。
- [ ] 注册 Vercel Blob（或确认现有 Blob 配置），验证浏览器直传签名 URL 流程。
- [ ] （可选）在 Modal 上起一个最小 FastAPI + ACE-deepfake-detector 镜像，跑通一次推理，作为 fallback POC。

### Phase 1 — MVP（PRIMARY 路径，Sightengine）
**新增/修改文件**：
- `prisma/schema.prisma` — 新增 `VideoJob`、`VideoUsageRecord`（或 `VideoDetectionHistory`）。
- `lib/video/engine-sightengine.ts` — 封装：直传 Upload API、`check.json` 异步提交、webhook 验签、结果归一化为 `{ aiProbability, verdict, confidence, evidence[] }`（对齐现有 `analyzeImage` 返回结构）。
- `lib/video/quota.ts` — 视频档位限额（匿名1/免费3/Pro20/ Business∞）+ 日计数（复用 `UsageRecord` 逻辑）。
- `app/api/detect-video/prepare/route.ts` — 返回 Blob 签名上传 URL（小 JSON，秒级）。
- `app/api/detect-video/route.ts` — 建 `VideoJob` + 触发 Sightengine 异步 + 返回 `jobId`（复用 `route.ts` 的鉴权/配额骨架）。
- `app/api/detect-video/webhook/route.ts` — 收 Sightengine 回调，HMAC 验签，更新 `VideoJob`，写历史。
- `app/api/detect-video/status/route.ts` — 前端轮询：`{ status, result? }`。
- `components/VideoUploader.tsx` — 直传 Blob + 进度条 + 状态机（uploading→queued→analyzing→done）。
- `components/VideoResultCard.tsx` — 复用 `ResultCard` 样式，展示概率/证据/逐段时间线。
- `app/(视频检测页)/page.tsx` 或在现有首页增加「图片 / 视频」Tab。

**外部服务需注册**：Sightengine 账号、Vercel Blob（若未开）。

### Phase 2 — 付费墙 & 历史 & 多引擎
- [ ] 服务端按 `plan` 裁剪 `evidence`（对齐 `route.ts:247-251`）。
- [ ] 视频检测历史落库，跨设备可查。
- [ ] 接 Stripe/现有付费逻辑对 Pro/Business 放开更高配额与更大文件。

### Phase 3 — FALLBACK 路径（Modal 自托管）
- [ ] `lib/video/engine-modal.ts` — 同一接口，调 Modal FastAPI worker（拉 Blob URL → 跑 ACE/DFD-FCG → 回写）。
- [ ] `VideoJob.engine` 字段决定走哪条；可按时长/成本/文件大小自动路由（如 >500 MB 自动走 Modal）。
- [ ] 加 Deepware Scanner 作为免费三审兜底（仅当 Sightengine 置信度处于灰色区间时触发）。

### 明确**不**做（避免范围蔓延）
- 不自训模型、不碰 Microsoft/Google 不可集成的方案。
- MVP 不做实时直播检测、不做音频深伪单独管线（除非用 Resemble）。
- 不做客户端本地推理（移动端跑不动重模型）。

---

## 5. 风险与缓解

| 风险 | 严重度 | 缓解 |
|---|---|---|
| **误杀合法编辑视频**（剪辑/滤镜/美颜被误判） | 高 | 输出"概率参考"而非定论；灰色区间（35–65%）引导人工复核；展示证据片段降低误判代价；明确免责声明（复用现有 `errors.quotaExhausted` 风格文案） |
| **视频文件过大** | 高 | 前端预压/限制（建议 ≤100 MB）；Sightengine 免费≤50MB/Pro≤500MB；超限自动路由 Modal 或拒绝并提示 |
| **成本失控**（某用户狂传长视频） | 中 | 日配额 + 单文件时长上限（如 ≤10 分钟，对齐 Deepware 限制）；Sightengine 按 ops 计，设月度预算告警；webhook 失败也要计费的边界需确认 |
| **CORS** | 中 | 浏览器直传 Blob 用**签名上传 URL**（同源/白名单），不暴露密钥；Sightengine 回调走我们自己的 `/webhook` 路由（Vercel 域名同源），无需浏览器 CORS；webhook 加 HMAC 验签防伪造 |
| **webhook 不可达 / 超时** | 中 | webhook 设超时重试；前端轮询同时带「最后 known 状态」；提供手动「刷新结果」按钮；`VideoJob` 有 `failed` 状态与错误信息 |
| **引擎准确率随生成器进化下降** | 中 | 多引擎预留（`engine` 字段）；定期用新测试集复测；真阳/假阳指标埋点 |
| **Vercel 函数冷启动导致 webhook 延迟** | 低 | webhook 路由保持轻量；可不依赖 DB 连接池长驻，按需连 |

---

## 6. 一句话决策

**用 Sightengine 异步视频 API（浏览器直传 Blob + Vercel 只做编排与 webhook）作为主路径，Modal 自托管开源模型作为降本/去依赖的备选，共用一套「任务表 + 轮询」骨架；视频数据永不经过 Vercel 函数，绕开 4.5 MB 硬限制。** 现有 Prisma 配额/付费墙逻辑原样复用，仅扩充 `VideoJob` 等新表。
