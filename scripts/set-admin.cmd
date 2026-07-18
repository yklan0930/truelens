@echo off
REM ─────────────────────────────────────────────────────────────
REM TrueLens — 一键把指定邮箱设为管理员 (Windows cmd 版)
REM 作用：users 表指定邮箱 → isAdmin=true, plan=business（无限次 + 完整报告）
REM 前置：已建表(db-push.cmd) + 该邮箱至少登录过一次 + .env.local 有 DATABASE_URL
REM 用法：scripts\set-admin.cmd admin@truelens.top
REM ─────────────────────────────────────────────────────────────
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

if "%~1"=="" (
  echo 用法: scripts\set-admin.cmd ^<email^>
  echo 示例: scripts\set-admin.cmd admin@truelens.top
  exit /b 1
)

set "EMAIL=%~1"
REM SQL-escape 单引号（把 ' 替换成 ''）
set "EMAIL_SQL=%EMAIL:'=''%"

REM 从 .env.local 提取 DATABASE_URL（Prisma CLI 默认只认 .env，不认 .env.local）
set "DATABASE_URL="
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "DATABASE_URL" ".env.local" 2^>nul`) do set "DATABASE_URL=%%B"

if "!DATABASE_URL!"=="" (
  echo [ERROR] 未在 .env.local 找到 DATABASE_URL
  exit /b 1
)

echo 正在将以下邮箱设为管理员: %EMAIL%
echo    (isAdmin=true, plan=business -^> 无限次检测 + 完整专业报告)
echo.

set "SQLFILE=%TEMP%\truelens_set_admin.sql"
(
  echo DO $$
  echo DECLARE
  echo   v_cnt integer;
  echo BEGIN
  echo   UPDATE "users" SET "isAdmin" = true, "plan" = 'business', "updatedAt" = now() WHERE "email" = '%EMAIL_SQL%';
  echo   GET DIAGNOSTICS v_cnt = ROW_COUNT;
  echo   IF v_cnt = 0 THEN RAISE NOTICE 'TL_ADMIN_RESULT: NO_SUCH_USER'; ELSE RAISE NOTICE 'TL_ADMIN_RESULT: OK rows=%%', v_cnt; END IF;
  echo END
  echo $$;
  echo SELECT email, "isAdmin", plan FROM "users" WHERE "email" = '%EMAIL_SQL%';
) > "%SQLFILE%"

type "%SQLFILE%" | node_modules\.bin\prisma.cmd db execute --stdin --schema prisma/schema.prisma 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] 执行失败。请确认: (1) 已运行 db-push.cmd 建表; (2) 本机可连数据库; (3) DATABASE_URL 正确
  exit /b 1
)

echo.
echo 完成。若显示 TL_ADMIN_RESULT: OK 或查询到该行即成功。
echo 若提示 NO_SUCH_USER，说明该邮箱从未登录，请先用此邮箱登录一次再重跑本脚本。
endlocal
