@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AgentShield - start
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "PNPM=corepack pnpm"

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
echo [1/5] Checking env files...
if not exist "infra\.env" copy /y "infra\.env.example" "infra\.env" >nul && echo       created infra\.env
if not exist "apps\server\.env" copy /y "apps\server\.env.example" "apps\server\.env" >nul && echo       created apps\server\.env
if not exist "apps\web\.env" copy /y "apps\web\.env.example" "apps\web\.env" >nul && echo       created apps\web\.env

rem ---------- 3. Dependencies ----------
echo [2/5] Installing dependencies (fast when up to date)...
call %PNPM% install --prefer-offline || call :die "pnpm install failed."

rem ---------- 4. Docker: postgres + redis + anvil ----------
echo [3/5] Making sure Docker is running...
docker info >nul 2>nul || call :startdocker

echo [4/5] Starting postgres, redis, anvil (waiting until healthy)...
docker compose -f infra\docker-compose.yml --env-file infra\.env up -d --build --wait || call :die "docker compose failed. Check FORK_URL in infra\.env and run: docker compose -f infra\docker-compose.yml logs"

rem ---------- 5. Database migrations ----------
echo [5/5] Applying database migrations...
pushd apps\server
if not exist "src\core\database\migrations" (
  echo       no migrations yet, generating from schema...
  call %PNPM% db:generate || (popd & call :die "drizzle generate failed.")
)
call %PNPM% db:migrate || (popd & call :die "drizzle migrate failed.")
popd

rem ---------- 6. Dev servers in a split terminal ----------
echo.
echo Launching frontend (left) and backend (right)...
echo   Web: http://localhost:5173    API: http://localhost:4000
echo   Bull Board: http://localhost:4000/admin/queues
echo   Stop infra later with: docker compose -f infra\docker-compose.yml down
echo.

where wt >nul 2>nul
if %errorlevel%==0 (
  wt -w new -d "%ROOT%\apps\web" --title "Frontend" cmd /k "%PNPM% dev" ; split-pane -V -d "%ROOT%\apps\server" --title "Backend" cmd /k "%PNPM% dev"
) else (
  echo Windows Terminal not found, opening two separate windows instead.
  start "Frontend" /d "%ROOT%\apps\web" cmd /k "%PNPM% dev"
  start "Backend" /d "%ROOT%\apps\server" cmd /k "%PNPM% dev"
)
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
timeout /t 3 /nobreak >nul
goto waitdocker

:die
echo.
echo [ERROR] %~1
echo.
pause
exit 1
