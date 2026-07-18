#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────
# TrueLens — 一键把指定邮箱设为管理员 (isAdmin=true, plan=business)
#
# 作用：
#   将 users 表中指定邮箱的账号提权为管理员：
#     - isAdmin = true  → 检测不限次数 + 查看完整专业报告
#     - plan    = business → 同上（双保险，避免后续逻辑变动）
#
# 前置条件：
#   1. 已运行 scripts/db-push.sh 建表（users 表存在）
#   2. 该邮箱**至少登录过一次**（GitHub/Google OAuth），否则 users 表里
#      还没有这一行，更新会影响 0 行 → 脚本会提示 NO_SUCH_USER，请先登录再跑
#   3. .env.local 中配置了 DATABASE_URL
#
# 用法（项目根目录执行）：
#   bash scripts/set-admin.sh admin@truelens.top
#
# 说明：
#   - 也可在 db-push 时顺便提权： bash scripts/db-push.sh --set-admin admin@truelens.top
#   - ADMIN_EMAILS 环境变量也能在登录前就赋予管理员身份；本脚本用于登录后
#     把角色写进数据库（更持久、不依赖环境变量）
# ───────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

if [ $# -lt 1 ]; then
  echo "用法: bash scripts/set-admin.sh <email>"
  echo "示例: bash scripts/set-admin.sh admin@truelens.top"
  exit 1
fi

EMAIL="$1"
# SQL-escape 单引号（邮箱极少含单引号，但仍做防御）
EMAIL_SQL="${EMAIL//\'/\'\'}"

# 加载 DATABASE_URL（Prisma CLI 默认只认 .env，不认 .env.local）
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ 未在 .env.local 找到 DATABASE_URL，请先配置（参考 .env.local.example）"
  exit 1
fi

export DATABASE_URL

echo "🔧 将以下邮箱设为管理员: $EMAIL"
echo "    (isAdmin=true, plan=business → 无限次检测 + 完整专业报告)"
echo ""

# 用占位符 + sed 注入邮箱，避免 heredoc 中 $$ 被 shell 展开
SQL=$(sed "s/__EMAIL__/$EMAIL_SQL/" <<'SQL'
DO $$
DECLARE
  v_cnt integer;
BEGIN
  UPDATE "users" SET "isAdmin" = true, "plan" = 'business', "updatedAt" = now() WHERE "email" = '__EMAIL__';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt = 0 THEN
    RAISE NOTICE 'TL_ADMIN_RESULT: NO_SUCH_USER';
  ELSE
    RAISE NOTICE 'TL_ADMIN_RESULT: OK rows=%', v_cnt;
  END IF;
END
$$;
SELECT email, "isAdmin", plan FROM "users" WHERE "email" = '__EMAIL__';
SQL
)

echo "$SQL" | ./node_modules/.bin/prisma db execute --stdin --schema prisma/schema.prisma 2>&1 || {
  echo ""
  echo "❌ 执行失败。请确认: (1) 已运行 db-push.sh 建表; (2) 本机网络可连数据库; (3) DATABASE_URL 正确"
  exit 1
}

echo ""
echo "✅ 完成。若上面显示 TL_ADMIN_RESULT: OK 或查询到该行，即设置成功。"
echo "   若提示 NO_SUCH_USER，说明该邮箱在 users 表中尚无记录 —— 请先用此邮箱登录一次，再重跑本脚本。"
