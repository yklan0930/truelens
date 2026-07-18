@echo off
setlocal
cd /d "%~dp0.."
echo Working directory: %CD%

REM Parse optional argument: --set-admin <email>
set "ADMIN_EMAIL="
:parse_args
if "%~1"=="" goto :args_done
if "%~1"=="--set-admin" (
  set "ADMIN_EMAIL=%~2"
  shift
  shift
  goto :parse_args
)
shift
goto :parse_args
:args_done

REM Load DATABASE_URL from .env.local if not already in environment
if not defined DATABASE_URL (
  for /f "usebackq tokens=1,* delims==" %%A in ("%CD%\.env.local") do (
    if "%%A"=="DATABASE_URL" set "DATABASE_URL=%%B"
  )
)

if not defined DATABASE_URL (
  echo ERROR: DATABASE_URL not found in environment or .env.local
  echo Add it to .env.local as:
  echo   DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
  exit /b 1
)

echo Found DATABASE_URL, syncing database schema...

if not exist "node_modules\.bin\prisma.cmd" (
  echo WARN: prisma not found, running npm install...
  call npm install
)

call node_modules\.bin\prisma.cmd db push
if errorlevel 1 (
  echo ERROR: prisma db push failed. Check DATABASE_URL is correct and network.
  exit /b 1
)

call node_modules\.bin\prisma.cmd generate

echo DB migration complete. Set ADMIN_EMAILS in Vercel and log in with that email to test.

if defined ADMIN_EMAIL (
  echo Promoting %ADMIN_EMAIL% to admin...
  call scripts\set-admin.cmd %ADMIN_EMAIL%
  if errorlevel 1 echo WARN: promotion failed. Log in with that email once, then run scripts\set-admin.cmd
)

endlocal
