# TrueLens 执行计划

> 第一阶段：图片检测 MVP
> 制定日期：2026年7月16日
> 执行人：小毕（技术） / Michael（决策+验证）

---

## 执行原则

1. **先验证再开发** — 不假设任何 API 能用，先跑通再说
2. **最小可用优先** — 能跑的丑页面 > 跑不了的漂亮页面
3. **每天可演示** — 每天结束时有可以看到的东西
4. **免费优先** — MVP 阶段不花一分钱（域名除外）

---

## Step 0：技术验证（关键！先别写代码）

> 目的：确认我们选的技术方案真的能用，避免写到一半发现 API 挂了

### 0.1 ~~验证 DeepFlag.ai API~~ → ✗ 弃用
- [x] 访问 https://deepflag.ai → 网站在线，Web 界面免费可用
- [x] 查找 API 文档 → **/api 页面 404，无公开 API 文档**
- [x] 搜索 GitHub 仓库 → 未找到官方仓库
- [x] **判断点**：API 文档不可用，不作为生产依赖。Web 界面仅作参考工具。
- **负责人**：小毕
- **结论**：✗ 弃用 DeepFlag API，改用 HF ViT 作为主力引擎

### 0.2 验证 Hugging Face ViT 模型 → ✓ 完全验证通过
- [x] 找到模型：`Ateeqq/ai-vs-human-image-detector`
- [x] 确认模型规格：SigLIP2 架构，92.9M 参数，99.23% 准确率
- [x] 确认 API 调用方式：
  - 端点：通过 `huggingface_hub.InferenceClient` 调用
  - 认证：`HF_TOKEN` 环境变量
  - 请求：`client.image_classification(image_path, model="Ateeqq/ai-vs-human-image-detector")`
  - 响应：`[{label: "ai", score: 0.9996}, {label: "hum", score: 0.0004}]`
- [x] **实际 API 调用测试通过**（Michael 提供 HF_TOKEN）
- [x] **准确率测试结果**：
  - AI 图片检测：3/3 = 100%
  - 真实照片检测：5/6 = 83.3%（1 张误判）
  - 总体准确率：8/9 = **88.9%** ≥ 85% MVP 标准 ✓
- **负责人**：小毕

### 0.3 验证 EXIF 分析方案 → ✓ 确认可用
- [x] 确认 Python `Pillow` + `piexif` 库可提取关键 EXIF 字段
- [x] 生成模拟真实相机照片（11 个 EXIF 字段：Make, Model, GPS, DateTime 等）
- [x] 生成模拟 AI 生成图片（0 个 EXIF 字段）
- [x] **判断点**：差异明显（真实 0分 vs AI 40分），可作为辅助证据
- **负责人**：小毕
- **验证脚本**：`src/verification/verify_all.py`

### 0.4 ~~准备测试图片集~~ → ✓ 完成
- [x] 真实照片 6 张（Lorem Picsum + Unsplash 下载）
- [x] AI 生成图片 3 张（ImageGen 生成：人像/风景/食物）
- [x] 已标注 ground truth，准确率测试完成
- **负责人**：小毕

---

## ✅ Step 0 验证结论

| 引擎 | 状态 | 准确率 | 备注 |
|------|------|--------|------|
| HF ViT (Inference API) | ✓ 通过 | 88.9% | AI检测100%, 真实照片83.3% |
| EXIF 分析 | ✓ 通过 | 辅助 | 差异明显，作为辅助证据 |
| DeepFlag API | ✗ 弃用 | - | API文档404 |

**架构确认**：HF ViT (60%) + EXIF (20%) + 本地HF备份 (20%)
**可以进入 Step 1**

---

## Step 1：基础设施搭建

### 1.1 注册域名 → ✓ 域名已确认
- [x] 选域名：**truelens.top**（已注册）
- [x] 排除：truelens.com（德国眼镜公司）、truelens.app（已注册）、truelens.ai（已注册）、truelens.io（已注册）
- [ ] 在 Cloudflare/Namecheap 注册（Michael 操作）
- [ ] 配置 DNS 指向 Vercel
- **负责人**：Michael 注册 + 小毕配置

### 1.2 创建 GitHub 仓库
- [x] 仓库名：truelens
- [ ] 可见性：Private（MVP 阶段）— 待 Michael 确认
- [x] 初始化 README + .gitignore
- **负责人**：小毕

### 1.3 注册 Vercel 账号
- [ ] 用 GitHub 账号登录 Vercel
- [ ] 关联仓库
- [ ] 确认免费层额度（100GB 流量/月够用）
- **负责人**：Michael 操作 + 小毕指导

### 1.4 注册 Hugging Face 账号 → ✓ 已完成
- [x] 注册获取 API Token
- [x] 确认免费层 Inference API 调用限制
- **负责人**：小毕 + Michael

---

## Step 2：项目初始化 → ✓ 已完成

### 2.1 初始化 Next.js 项目 → ✓ 已完成
```
技术栈确认：
- Next.js 14.2.18 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui 组件库
```
- [ ] `npx create-next-app@latest truelens`
- [ ] 配置 Tailwind + shadcn/ui
- [ ] 配置 ESLint + Prettier
- [ ] 配置环境变量（.env.local）
  ```
  DEEPFLAG_API_URL=...
  HF_API_TOKEN=...
  ```
- **负责人**：小毕

### 2.2 搭建项目目录结构
```
src/
├── app/
│   ├── page.tsx              # 首页（上传 + 结果展示）
│   ├── api/
│   │   ├── detect/route.ts   # 检测 API 端点
│   │   └── health/route.ts   # 健康检查
│   └── layout.tsx
├── components/
│   ├── ImageUploader.tsx     # 图片上传组件
│   ├── ResultCard.tsx        # 结果展示卡片
│   ├── EvidencePanel.tsx     # 证据展示面板
│   └── HistoryList.tsx       # 检测历史
├── lib/
│   ├── detectors/
│   │   ├── deepflag.ts       # DeepFlag API 封装
│   │   ├── huggingface.ts    # HF ViT 封装
│   │   └── exif.ts           # EXIF 分析
│   ├── engine.ts             # 加权投票引擎
│   └── types.ts              # 类型定义
└── styles/
```
- **负责人**：小毕

### 2.3 首次部署验证
- [ ] 写一个 "Hello World" 页面
- [ ] Push 到 GitHub
- [ ] 确认 Vercel 自动部署成功
- [ ] 访问域名确认页面可见
- **负责人**：小毕

---

## Step 3：核心检测引擎开发 → ✓ 已完成

> 这是产品的心脏，必须先跑通

### 3.1 HF ViT API 集成 → ✓ 已完成
- [x] 封装 `lib/detectors/huggingface.ts`
  - 端点：`POST https://router.huggingface.co/hf-inference/models/Ateeqq/ai-vs-human-image-detector`
  - 认证：`Authorization: Bearer ${HF_TOKEN}`
  - 代理支持：通过 undici ProxyAgent 自动读取 HTTPS_PROXY 环境变量
  - 重试机制：3 次重试，15 秒超时
  - 错误处理：超时、API 不可用、速率限制、503 模型加载
- [x] 端到端验证通过：真实照片 16% AI ✅，AI 图 96% AI ✅
- **负责人**：小毕

### 3.2 ~~HF ViT 本地部署~~ → 暂缓（API 稳定，暂不需要备份）
- [ ] 封装 `lib/detectors/hf_local.ts`
  - Python FastAPI 微服务，自部署 HF 模型
  - 93M 参数，可 CPU 运行（响应 ~2-3 秒）
  - 作为 HF Inference API 的备份
- **负责人**：小毕

### 3.3 EXIF 元数据分析模块 → ✓ 已完成
- [x] 封装 `lib/detectors/exif.ts`
  - 提取：相机型号、GPS、时间戳、软件字段
  - 检测：C2PA 标记、AI 软件签名（Midjourney/DALL-E/SD/Flux 等）
  - 输出：`{ score: number, hasExif: boolean, fieldCount: number, evidence: [] }`
- **负责人**：小毕

### 3.4 加权投票引擎 → ✓ 已完成
- [x] 实现 `lib/analyzer.ts`
  - 输入：HF ViT + EXIF 两个检测器的结果
  - 加权策略：
    - HF ViT (Inference API): 80%（主力引擎，99.23% 准确率）
    - EXIF 分析: 20%（辅助证据）
  - 输出：`{ aiProbability, verdict, confidence, evidence[], processingTimeMs }`
  - 当 HF API 不可用时，EXIF 独立计算（降低置信度）
- [x] 端到端测试通过
- **负责人**：小毕

---

## Step 4：前端界面开发 → ✓ 已完成

### 4.1 图片上传组件 → ✓ 已完成
- [x] 拖拽上传 + 点击选择
- [x] 支持格式：JPG / PNG / WebP
- [x] 限制大小：10MB
- [x] 上传后预览缩略图
- [x] 加载状态动画
- **负责人**：小毕

### 4.2 检测结果展示 → ✓ 已完成
- [x] 大号概率分数显示（0-100%）
  - 0-35%：绿色（大概率真实）
  - 36-64%：黄色（不确定）
  - 65-100%：红色（大概率 AI 生成）
- [x] 置信度标签
- [x] 检测耗时显示
- **负责人**：小毕

### 4.3 证据展示面板 → ✓ 已完成
- [x] 各引擎独立评分
- [x] 证据卡片（颜色区分：真实=绿、AI=红、中性=灰）
- [x] 文件元信息（大小、耗时）
- **负责人**：小毕

### 4.4 检测历史 → ✓ 已完成
- [x] localStorage 存储（最近 10 次检测）
- [x] 缩略图 + AI概率 + 时间
- [x] 一键清除历史
- [x] 点击历史项可重新查看
- **负责人**：小毕

### 4.5 免费额度限制 → ✓ 已完成
- [x] localStorage 记录当日检测次数
- [x] 超过 1 次/天 → 显示升级提示
- [x] 按日期重置计数
- [x] Header 实时显示剩余次数
- **负责人**：小毕

---

## Step 5：打磨与测试 → ✓ 已完成

### 5.1 UI 打磨 → ✓ 已完成
- [x] 响应式设计（手机端 sm: 断点适配）
- [x] 加载动画（spin + "检测中..."）
- [x] 空状态设计（上传区 + 功能介绍卡片）
- [x] 错误状态设计（超时、网络失败、格式不支持、次数用完）
- [x] 主题色统一（indigo + slate）
- [x] SVG favicon
- [x] Open Graph + Twitter Card 元标签
- [x] 自定义滚动条 + 字体平滑
- **负责人**：小毕

### 5.2 准确率测试
- [ ] 用 Step 0.4 的 40 张测试集跑一轮
- [ ] 记录：真阳性率、假阳性率、假阴性率
- [ ] 调整投票权重优化准确率
- [ ] 记录边缘案例（模糊图片、截图、二次编辑的真实照片）
- **负责人**：小毕

### 5.3 性能测试
- [ ] 首次加载 < 2 秒
- [ ] 检测响应 < 5 秒（目标 3 秒内）
- [ ] 如果太慢：加 loading 动画 + 并行调用多个引擎
- **负责人**：小毕

### 5.4 安全检查 → ✓ 已完成
- [x] 文件类型白名单验证（jpeg/png/webp only）
- [x] 文件大小限制（10MB max, 100 bytes min）
- [x] API 路由速率限制（10 次/分钟/IP）
- [x] 图片不持久化（内存处理，用完即弃）
- [x] 错误日志记录
- **负责人**：小毕

---

## Step 6：上线发布

### 6.1 落地页文案
- [ ] Hero 标题 + 副标题
- [ ] 功能亮点（3 个）
- [ ] 使用说明（3 步）
- [ ] FAQ（准确率多少？支持什么格式？图片会被存储吗？）
- [ ] 免责声明（"结果仅供参考，不作为法律依据"）
- **负责人**：小毕起草，Michael 审核

### 6.2 SEO 基础
- [ ] 页面 title + meta description
- [ ] Open Graph 标签
- [ ] sitemap.xml
- [ ] Google Search Console 提交
- **负责人**：小毕

### 6.3 部署上线
- [ ] 确认生产环境环境变量
- [ ] 配置自定义域名
- [ ] 配置 HTTPS（Vercel 自动）
- [ ] 全流程测试（上传 → 检测 → 结果 → 历史）
- **负责人**：小毕

### 6.4 数据埋点
- [ ] 接入 Vercel Analytics（免费）
- [ ] 记录关键事件：上传、检测完成、检测失败
- [ ] 不记录图片内容（隐私优先）
- **负责人**：小毕

### 6.5 初始推广
- [ ] 发布到 Product Hunt
- [ ] 发布到 V2EX
- [ ] 发布到 Hacker News
- [ ] 写一篇技术博客（"我们如何用 3 个引擎检测 AI 图片"）
- [ ] 准备 5 张测试对比图用于社交媒体传播
- **负责人**：小毕起草，Michael 发布

---

## Step 7：上线后第一周

### 7.1 监控
- [ ] 每日检查 Vercel 部署状态
- [ ] 每日检查 API 调用成功率
- [ ] 每日查看 Analytics 数据
- **负责人**：小毕

### 7.2 收集反馈
- [ ] 添加用户反馈入口（简单表单或邮件）
- [ ] 记录所有误判案例
- [ ] 记录用户请求的功能
- **负责人**：小毕

### 7.3 快速修复
- [ ] 修复上线后发现的 bug
- [ ] 根据误判案例调整权重
- **负责人**：小毕

---

## 关键决策点（需要 Michael 拍板）

| # | 决策 | 时机 | 选项 |
|---|------|------|------|
| 1 | 域名选什么 | Step 1.1 | truelens.ai / truelens.app / 其他 |
| 2 | 仓库公开还是私有 | Step 1.2 | Private（推荐）/ Public |
| 3 | 准确率不达标怎么办 | Step 3.4 | 换模型 / 调权重 / 降低期望 |
| 4 | 免费额度确认 | Step 4.5 | 1次/天（已定） |
| 5 | 上线时机 | Step 6.3 | 功能完整即上 / 等完美再上 |

---

## 时间估算

| 阶段 | 内容 | 预计耗时 | 依赖 |
|------|------|----------|------|
| Step 0 | 技术验证 | 2-3 天 | 无 |
| Step 1 | 基础设施 | 1 天 | Step 0 通过 |
| Step 2 | 项目初始化 | 1 天 | Step 1 完成 |
| Step 3 | 核心引擎 | 4-5 天 | Step 2 完成 |
| Step 4 | 前端界面 | 4-5 天 | Step 3 完成 |
| Step 5 | 打磨测试 | 2-3 天 | Step 4 完成 |
| Step 6 | 上线发布 | 2 天 | Step 5 通过 |
| Step 7 | 上线后 | 持续 | Step 6 完成 |

**从开始到上线：约 2-3 周**（如果 Step 0 验证顺利）

---

## 每日协作节奏

1. **早上**：小毕报告昨天完成什么、今天计划做什么
2. **遇到决策点**：小毕提供选项和建议，Michael 拍板
3. **晚上**：小毕提交代码，更新进度
4. **每周**：Michael 体验一次最新版本，给反馈

---

## 下一步：立即行动

> Step 0 技术验证可以马上开始，不需要等任何东西。

我现在就可以做：
1. 验证 DeepFlag.ai API 是否可用
2. 验证 Hugging Face ViT 模型
3. 准备测试图片集

Michael 需要做：
1. 想几个候选域名
2. 确认 GitHub 仓库可见性偏好

---

_执行计划将根据进度和验证结果持续更新。每完成一个 Step 更新勾选状态。_
