@echo off
REM ============================================================
REM TrueLens - promote a registered email to admin (Windows cmd)
REM Effect: users row -> isAdmin=true, plan=business (unlimited + full report)
REM Prereq: tables exist (run db-push.cmd) + email logged in at least once
REM          + .env.local has DATABASE_URL
REM Usage:  scripts\set-admin.cmd admin@truelens.top
REM ============================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

if "%~1"=="" (
  echo Usage: scripts\set-admin.cmd ^<email^>
  echo Example: scripts\set-admin.cmd admin@truelens.top
  exit /b 1
)

set "EMAIL=%~1"
REM SQL-escape single quotes (replace ' with '')
set "EMAIL_SQL=%EMAIL:'=''%"

REM Load DATABASE_URL from .env.local (Prisma CLI only reads .env, not .env.local)
set "DATABASE_URL="
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "DATABASE_URL" ".env.local" 2^>nul`) do set "DATABASE_URL=%%B"

if "!DATABASE_URL!"=="" (
  echo [ERROR] DATABASE_URL not found in .env.local
  exit /b 1
)

echo Promoting email to admin: %EMAIL%
echo   (isAdmin=true, plan=business -> unlimited detections + full report)
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
  echo [ERROR] Execution failed. Check: (1) ran db-push.cmd to build tables; (2) network to DB; (3) DATABASE_URL correct
  exit /b 1
)

echo.
echo Done. If you see TL_ADMIN_RESULT: OK or the row is selected, it succeeded.
echo If NO_SUCH_USER, the email never logged in; log in once, then re-run this script.
endlocal
