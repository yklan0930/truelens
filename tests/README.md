# TrueLens QA Test Kit

## 目录结构

```
tests/
├── run.js          # 测试引擎 — 读 manifest → 调 API → 出报告
├── manifest.json   # 测试清单 — 图片文件 → 期望结果
├── images/         # 测试图片 — 放在这里
│   ├── ai-*.jpg    # AI 生成图
│   └── real-*.jpg  # 真实拍摄图
└── reports/        # 自动生成的报告
    └── YYYY-MM-DD.md
```

## 如何添加测试图片

1. 把图片放到 `tests/images/` 目录
2. 在 `manifest.json` 的 `tests` 数组里添加一条记录：

```json
{ "file": "my-test.jpg", "expected": "ai", "category": "landscape", "note": "用户反馈：这图AI味很高但判了真实" }
```

- `file` — 文件名（相对于 images/）
- `expected` — 期望结果：`"ai"` 或 `"real"` 或 `"uncertain"`
- `category` — 分类标签（可选）：`landscape` `portrait` `food` `animal` `street`
- `note` — 备注说明

## 如何运行

**线上模式**（调 truelens.top API，测试已部署的版本）：
```
node tests/run.mjs
```

**本地模式**（需要先启动本地服务）：
```
API_URL=http://localhost:3000 node tests/run.mjs
```

**结果**：
- 控制台输出摘要 + 每个测试的详细结果
- 报告写到 `tests/reports/YYYY-MM-DD.md`

## 自动化

每天 08:00 自动运行。结果在 `tests/reports/` 里。
