# TrueLens 用户系统配置指南

代码已开发完成并推送。激活用户系统需要完成以下 5 步配置。

> **重要**：不配置也不影响现有功能。数据库未配置时，网站自动以匿名模式运行（和现在一样）。

---

## 第 1 步：启用 Vercel Postgres（2 分钟）

1. 打开 https://vercel.com/dashboard → 选择 truelens 项目
2. 顶部导航 → **Storage** → **Create Database**
3. 选择 **Postgres** → 命名 `truelens-db` → 创建
4. 创建后，Vercel 会自动把 `DATABASE_URL` 等环境变量注入项目
5. 记下 `DATABASE_URL` 的值（后面要用）

## 第 2 步：创建数据库表（1 分钟）

在本地项目目录运行：

```bash
cd TrueLens/TrueLens
npx prisma db push
```

这会根据 `prisma/schema.prisma` 在 Postgres 中创建所有表（users, accounts, sessions, usage_records, detection_history 等）。

> 如果本地没有 `DATABASE_URL`，先在 `.env` 文件中填入 Vercel Postgres 的连接字符串再运行。

## 第 3 步：创建 GitHub OAuth App（3 分钟）

1. 打开 https://github.com/settings/developers
2. **OAuth Apps** → **New OAuth App**
3. 填写：
   - **Application name**: TrueLens
   - **Homepage URL**: `https://truelens.top`
   - **Authorization callback URL**: `https://truelens.top/api/auth/callback/github`
4. 创建后，记下 **Client ID**
5. 点击 **Generate a new client secret** → 记下 **Client Secret**

## 第 4 步：创建 Google OAuth App（3 分钟）

1. 打开 https://console.cloud.google.com/
2. 创建项目（或选现有项目）→ **APIs & Services** → **Credentials**
3. **Create Credentials** → **OAuth client ID**
4. 应用类型选 **Web application**
5. **Authorized redirect URIs** 添加：
   `https://truelens.top/api/auth/callback/google`
6. 创建后记下 **Client ID** 和 **Client Secret**

> 首次使用需要先配置 **OAuth consent screen**（External → 填基本信息 → 保存）

## 第 5 步：配置 Vercel 环境变量（2 分钟）

在 Vercel 后台 → truelens 项目 → **Settings** → **Environment Variables**

添加以下变量（全部勾选 Production + Preview）：

| Key | Value |
|-----|-------|
| `DATABASE_URL` | （第 1 步获取的 Postgres 连接字符串） |
| `AUTH_SECRET` | 运行 `openssl rand -base64 32` 生成随机字符串 |
| `AUTH_GITHUB_ID` | （第 3 步的 GitHub Client ID） |
| `AUTH_GITHUB_SECRET` | （第 3 步的 GitHub Client Secret） |
| `AUTH_GOOGLE_ID` | （第 4 步的 Google Client ID） |
| `AUTH_GOOGLE_SECRET` | （第 4 步的 Google Client Secret） |
| `AUTH_TRUST_HOST` | `true` |

> `DATABASE_URL` 如果是通过 Vercel Storage 创建的，可能已经自动注入了，不需要手动添加。

## 第 6 步：重新部署

环境变量添加完成后：
1. Vercel 后台 → **Deployments**
2. 最新部署 → 右侧 **⋯** → **Redeploy**
3. 等待构建完成（约 1-2 分钟）

---

## 验证

部署完成后，打开 https://truelens.top：
- Header 右侧应该出现「Log in / Sign up」按钮
- 点击后弹出登录/注册弹窗
- 可以用 GitHub、Google 或邮箱密码登录
- 登录后 Header 显示头像，点击可看到菜单（退出登录、升级 Pro）
- 已登录用户每天 5 次检测（匿名用户 1 次）

## 已实现功能

| 功能 | 说明 |
|------|------|
| GitHub 登录 | OAuth 一键登录 |
| Google 登录 | OAuth 一键登录 |
| 邮箱注册 | 邮箱 + 密码（bcrypt 加密） |
| 邮箱登录 | Credentials 验证 |
| 用量追踪 | 服务端数据库记录每日检测次数 |
| 检测历史 | 已登录用户的检测结果保存到数据库 |
| 优雅降级 | 数据库未配置时自动退回匿名模式 |
| 中英文 | 所有认证 UI 双语支持 |
| 响应式 | 移动端友好的弹窗和菜单 |

## 配额设计

| 用户类型 | 每日检测次数 |
|----------|-------------|
| 匿名用户 | 1 次/天（localStorage） |
| 已登录免费用户 | 5 次/天（数据库） |
| Pro 用户（未来） | 无限 |
