@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AgentShield - start
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "PNPM=corepack pnpm"
set "SETUP_ONLY="
if /i "%~1"=="--setup-only" set "SETUP_ONLY=1"

rem Local dev from a fresh clone: env files -> deps -> shared build -> docker infra -> migrations
rem -> api + worker + web in a split terminal -> wait for /api/health -> open the browser.
rem   start.bat               everything
rem   start.bat --setup-only  stop after migrations (CI-style check, no windows)
rem Production on one laptop is a different file: docs/runbook/production.md

echo ============================================
echo  AgentShield - local environment bootstrap
echo ============================================

rem ---------- 1. Tooling ----------
where node >nul 2>nul || call :die "Node.js not found. Install Node 20+ from https://nodejs.org"
where docker >nul 2>nul || call :die "Docker not found. Install Docker Desktop."
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODEMAJOR=%%v"
set "NODEMAJOR=%NODEMAJOR:v=%"
if %NODEMAJOR% LSS 20 call :die "Node 20+ required (found v%NODEMAJOR%)."

rem ---------- 2. Env files (created once from the examples, never overwritten) ----------
echo [1/6] Checking env files...
if not exist "infra\.env" copy /y "infra\.env.example" "infra\.env" >nul && echo       created infra\.env
if not exist "apps\server\.env" copy /y "apps\server\.env.example" "apps\server\.env" >nul && echo       created apps\server\.env
if not exist "apps\web\.env" copy /y "apps\web\.env.example" "apps\web\.env" >nul && echo       created apps\web\.env

rem ---------- 3. Dependencies + shared package ----------
echo [2/6] Installing dependencies (fast when up to date)...
call %PNPM% install --frozen-lockfile --prefer-offline || call :die "pnpm install failed."
rem Server and web import @agentshield/shared from its dist/: build it before any dev server starts.
echo [3/6] Building packages/shared...
call %PNPM% --filter @agentshield/shared build >nul || call :die "Building packages/shared failed. Run: corepack pnpm --filter @agentshield/shared build"

rem ---------- 4. Docker: postgres + redis + anvil ----------
echo [4/6] Making sure Docker is running...
docker info >nul 2>nul || call :startdocker

echo [5/6] Starting postgres, redis, anvil (waiting until healthy)...
docker compose -f infra\docker-compose.yml --env-file infra\.env up -d --build --wait || call :die "docker compose failed. Check FORK_URL in infra\.env and run: docker compose -f infra\docker-compose.yml logs"

rem ---------- 5. Database migrations ----------
echo [6/6] Applying database migrations...
pushd apps\server
call %PNPM% db:migrate || (popd & call :die "drizzle migrate failed. Is postgres up? docker compose -f infra\docker-compose.yml ps")
popd

if defined SETUP_ONLY (
  echo.
  echo Setup done ^(--setup-only^): dev servers not started.
  endlocal
  exit /b 0
)

rem ---------- 6. Dev servers in a split terminal ----------
echo.
echo Launching frontend (left) and backend: api + worker (right)...
where wt >nul 2>nul
if %errorlevel%==0 (
  wt -w new -d "%ROOT%\apps\web" --title "Frontend" cmd /k "%PNPM% dev" ; split-pane -V -d "%ROOT%\apps\server" --title "Backend" cmd /k "%PNPM% dev"
) else (
  echo Windows Terminal not found, opening two separate windows instead.
  start "Frontend" /d "%ROOT%\apps\web" cmd /k "%PNPM% dev"
  start "Backend" /d "%ROOT%\apps\server" cmd /k "%PNPM% dev"
)

rem ---------- 7. Wait until the API answers, then open the app ----------
echo Waiting for the API (the first start compiles both apps: up to 4 minutes)...
set /a TRIES=0
:waitapi
curl -fs http://localhost:4000/api/health >nul 2>nul && goto apiup
set /a TRIES+=1
if %TRIES% GEQ 120 (
  echo [WARN] API not answering after 4 minutes: look at the Backend window for the error.
  goto banner
)
ping -n 3 127.0.0.1 >nul
goto waitapi

:apiup
echo       API is up:
curl -s http://localhost:4000/api/health
echo.
start "" http://localhost:5173

:banner
echo.
echo   Web:        http://localhost:5173
echo   API health: http://localhost:4000/api/health
echo   API:        http://localhost:4000/api/v1/...   (Bull Board: /api/v1/admin/queues, admin only)
echo   Stop infra: docker compose -f infra\docker-compose.yml down
echo.
endlocal
exit /b 0

:startdocker
echo       Docker is not running, starting Docker Desktop...
if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" call :die "Docker Desktop not found. Start Docker manually and re-run."
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a TRIES=0
:waitdocker
docker info >nul 2>nul && exit /b 0
set /a TRIES+=1
if %TRIES% GEQ 60 call :die "Docker did not become ready within 3 minutes."
ping -n 4 127.0.0.1 >nul
goto waitdocker

:die
echo.
echo [ERROR] %~1
echo.
if not defined SETUP_ONLY pause
exit 1
