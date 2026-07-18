# Chrome 扩展发布清单（TrueLens v1.0.0）

> 代码已完整（MV3）。本清单用于向 Chrome Web Store 提审。发布动作需 Michael 的 Google 开发者账号（$5 一次性注册费）。

## 已就绪（Agent 已验证）
- [x] `manifest.json` — MV3，permissions: contextMenus/storage/activeTab/scripting，host_permissions 含 `https://truelens.top/*`
- [x] `background.js` — 右键菜单 → 取图 → POST `https://truelens.top/api/detect` → 角标 + 浮卡
- [x] `popup.js/html/css` — 展示最近一次结果，双语
- [x] `content.js/css` — 页面内浮卡
- [x] `icons/` — 16/48/128 PNG
- [x] `_locales/en` + `_locales/zh_CN` — 与 `default_locale: "en"` 匹配
- [x] 打包 zip：`extension-build/truelens-chrome-extension-v1.0.0.zip`（manifest.json 在根）

## 发布前需 Michael 处理
1. **注册 Chrome 开发者账号**：https://chrome.google.com/webstore/devconsole/ （$5）
2. **填写商品信息**：
   - 名称：TrueLens — AI Image Detector
   - 简介（<132 字符）+ 详细说明
   - 分类：Photos / Productivity
   - 语言：English / 简体中文
   - 隐私政策 URL（复用站点 `/privacy` 或新增静态页）
   - 单张宣传图 1280×800，至少 1 张截图 1280×800
3. **上传 zip**：开发者控制台 → 新项目 → 上传 → 选 `extension-build/truelens-chrome-extension-v1.0.0.zip`
4. **提交审核**：通常 1–3 个工作日

## 已知限制（建议下一版修复，非发布 blocker）
- **匿名调用 API**：扩展不携带登录态，所有用户按匿名计（每 IP 每日 1 次）。公开后极易触发限流。
  - 修复方向：popup 增加「登录 TrueLens」按钮，用 OAuth 拿 token 后随请求带 `Authorization`；detect 路由已支持 session，需扩展侧补 token 持久化（chrome.storage）。
- **无错误上报/埋点**：无法衡量扩展带来的注册转化，建议接 Vercel Analytics 事件或 UTM 参数。
- **仅图片**：视频/链接检测未覆盖（路线图第二阶段）。

## 本地自测（发布前建议）
1. `chrome://extensions` → 开发者模式 → 加载已解压的扩展 → 选 `extension/` 目录
2. 右键任意网页图片 → 「用 TrueLens 检测」→ 应出现角标 `AI`/`OK` 与浮卡
3. 点击扩展图标 → popup 显示完整结果 + 「查看完整报告」跳转 truelens.top
