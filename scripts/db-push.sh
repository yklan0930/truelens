#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────
# TrueLens — 一键数据库迁移脚本 (Prisma db push)
#
# 作用：
#   1. 把 prisma/schema.prisma 的结构同步到数据库
#      （首次执行会自动建表：users / accounts / sessions / usage_records /
#       detection_history，并为 users 表加上 isAdmin / plan 等字段）
#   2. 重新生成 Prisma 客户端，与 Vercel 部署时的 postinstall 保持一致
#
# 前置条件：
#   .env.local 中已配置真实的 DATABASE_URL（连接串来自 Vercel Postgres）
#   例：DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
#
# 用法（在 Git Bash / 终端，项目根目录执行）：
#   bash scripts/db-push.sh
#   bash scripts/db-push.sh --set-admin admin@truelens.top   # 建表后顺便提权
#
# 说明：
#   - Prisma CLI 默认只读取 .env，不读 .env.local；本脚本会手动 source .env.local
#   - 若国内网络连 Vercel Postgres 不通，请先开好代理 / VPN 再运行
# ───────────────────────────────────────────────────────────────────────
set -euo pipefail

# 切到脚本所在目录的上级（项目根）
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "📁 工作目录: $ROOT"

# 可选参数：--set-admin <email>  → 建表后顺便把指定邮箱提权为管理员
ADMIN_EMAIL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --set-admin)
      ADMIN_EMAIL="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# 1. 确保依赖已安装（prisma 二进制在 node_modules/.bin 下）
if [ ! -x ./node_modules/.bin/prisma ]; then
  echo "⚠️  未找到 node_modules/prisma，先执行 npm install ..."
  npm install
fi

# 2. 读取 DATABASE_URL
#    Prisma CLI 默认只认 .env；Next.js 用 .env.local，这里手动加载
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  echo "🔧 从 .env.local 加载环境变量 ..."
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ 未检测到 DATABASE_URL。"
  echo "   请先在 Vercel 创建 Postgres 数据库，复制连接串，"
  echo "   并在本项目 .env.local 里加一行："
  echo "   DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require"
  exit 1
fi

echo "✅ 检测到 DATABASE_URL，开始同步数据库结构 ..."

# 3. 同步 schema → 数据库（建表 / 加列）
#    注意：当前 Prisma 版本的 db push 不接受 --skip-generate，去掉该选项
./node_modules/.bin/prisma db push

# 4. 重新生成 Prisma 客户端（与 Vercel 部署的 postinstall 保持一致）
./node_modules/.bin/prisma generate

echo ""
echo "🎉 数据库迁移完成！"
echo "   接下来可以在 Vercel 配 ADMIN_EMAILS，用管理员邮箱登录测试了。"

# 可选：建表后顺便把指定邮箱提权为管理员
if [ -n "$ADMIN_EMAIL" ]; then
  echo ""
  echo "🔑 建表完成，开始把 $ADMIN_EMAIL 设为管理员 ..."
  bash scripts/set-admin.sh "$ADMIN_EMAIL" || echo "⚠️  提权步骤未成功（若该邮箱尚未登录过会提示 NO_SUCH_USER，请登录后重跑 scripts/set-admin.sh）"
fi
