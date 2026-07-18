@echo off
REM ============================================================
REM TrueLens - one-shot DB migration script (Windows cmd)
REM Usage:  in cmd, from project root:  scripts\db-push.cmd
REM         optional: scripts\db-push.cmd --set-admin admin@truelens.top
REM Prereq: .env.local has DATABASE_URL (from Prisma Postgres / Vercel Postgres)
REM ============================================================
setlocal EnableDelayedExpansion

cd /d "%~dp0.."

echo Working directory: %CD%

REM Optional argument: --set-admin <email>  -> promote to admin after push
set "ADMIN_EMAIL="
set "SKIPNEXT=0"
for %%A in (%*) do (
  if !SKIPNEXT!==1 (
    set "ADMIN_EMAIL=%%A"
    set "SKIPNEXT=0"
  ) else if "%%A"=="--set-admin" (
    set "SKIPNEXT=1"
  )
)

REM 1. Ensure dependencies installed (prisma binary under node_modules/.bin)
if not exist "node_modules\.bin\prisma.cmd" (
  echo WARN: node_modules\prisma not found, running npm install ...
  call npm install
)

REM 2. Load DATABASE_URL (Prisma CLI only reads .env, not .env.local; read from .env.local here)
if not defined DATABASE_URL (
  for /f "tokens=1,* delims==" %%A in ('findstr /b "DATABASE_URL=" ".env.local" 2^>nul') do set "%%A=%%B"
)

if not defined DATABASE_URL (
  echo ERROR: DATABASE_URL not found.
  echo   Create a Postgres DB (Vercel or Prisma Postgres), copy the connection string,
  echo   and add it to .env.local as:  DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
  exit /b 1
)

echo Found DATABASE_URL, syncing database schema ...

REM 3. Push schema -> database (create tables / add isAdmin,plan columns)
call node_modules\.bin\prisma.cmd db push --skip-generate
if errorlevel 1 (
  echo ERROR: prisma db push failed. Check DATABASE_URL is correct and network
  echo   (in CN, use a proxy/VPN to reach external Postgres).
  exit /b 1
)

REM 4. Regenerate Prisma client (matches Vercel deploy postinstall)
call node_modules\.bin\prisma.cmd generate

echo.
echo DB migration complete! Now set ADMIN_EMAILS in Vercel and log in with that email to test.

REM Optional: promote admin right after push
if defined ADMIN_EMAIL (
  echo.
  echo Promoting !ADMIN_EMAIL! to admin ...
  call scripts\set-admin.cmd !ADMIN_EMAIL!
  if errorlevel 1 echo WARN: promotion step failed (if NO_SUCH_USER, log in with that email once, then run scripts\set-admin.cmd)
)

endlocal
