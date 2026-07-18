@echo off
REM ─────────────────────────────────────────────────────────────
REM TrueLens — 一键数据库迁移脚本 (Windows cmd 版)
REM 作用：把 Prisma schema 同步到数据库（建表 + 加 isAdmin/plan），并重新生成客户端
REM 用法：在 cmd 里进入项目根目录，执行  scripts\db-push.cmd
REM 前置：.env.local 中已配置 DATABASE_URL（来自 Prisma Postgres / Vercel Postgres）
REM ─────────────────────────────────────────────────────────────
setlocal

REM 切到脚本所在目录的上级（项目根）
cd /d "%~dp0.."

echo 📁 工作目录: %CD%

REM 1. 确保依赖已安装
if not exist "node_modules\.bin\prisma.cmd" (
  echo ⚠️  未找到 node_modules\prisma，先执行 npm install ...
  call npm install
)

REM 2. 读取 DATABASE_URL（Prisma CLI 默认只认 .env，不认 .env.local；这里从 .env.local 提取）
if not defined DATABASE_URL (
  for /f "tokens=1,* delims==" %%A in ('findstr /b "DATABASE_URL=" ".env.local" 2^>nul') do set "%%A=%%B"
)

if not defined DATABASE_URL (
  echo ❌ 未检测到 DATABASE_URL。
  echo    请先在 Vercel 创建 Postgres（或 Prisma Postgres），复制连接串，
  echo    粘贴到本项目 .env.local 里（加一行：DATABASE_URL=postgresql://...）
  exit /b 1
)

echo ✅ 检测到 DATABASE_URL，开始同步数据库结构 ...

REM 3. 同步 schema → 数据库
call node_modules\.bin\prisma.cmd db push --skip-generate
if errorlevel 1 (
  echo ❌ prisma db push 失败，请检查 DATABASE_URL 是否正确、以及网络（国内需代理/VPN 才能连外部 Postgres）。
  exit /b 1
)

REM 4. 重新生成 Prisma 客户端（与 Vercel 部署的 postinstall 保持一致）
call node_modules\.bin\prisma.cmd generate

echo.
echo 🎉 数据库迁移完成！现在可以去 Vercel 配 ADMIN_EMAILS，用管理员邮箱登录测试了。
endlocal
