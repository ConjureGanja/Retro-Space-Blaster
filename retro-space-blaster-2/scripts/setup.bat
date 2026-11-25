@echo off
REM ==========================================================================
REM  setup.bat - first-time setup on a Windows PC (run once per machine)
REM
REM  WHAT: checks Node.js, installs exact dependency versions, logs the
REM        Devvit CLI into your Reddit account.
REM  WHY:  `npm ci` (not `npm install`) installs exactly what package-lock.json
REM        says - same versions CI uses, so "works on my machine" = works in CI.
REM  ANALOGY: unpacking the gear truck and checking every case against the
REM           manifest before the shoot day starts.
REM ==========================================================================
setlocal
pushd "%~dp0.."

echo.
echo [1/3] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js not found. Install Node 24 LTS from https://nodejs.org then re-run.
  goto :fail
)
REM Supported: 22.13+ or 24+ (ESLint 10 needs ^22.13 ^|^| ^>=24; Node 23 is not LTS).
for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
  set NODE_MAJOR=%%a
  set NODE_MINOR=%%b
)
set NODE_OK=0
if %NODE_MAJOR% GEQ 24 set NODE_OK=1
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% GEQ 13 set NODE_OK=1
if %NODE_OK%==0 (
  echo   Node %NODE_MAJOR%.%NODE_MINOR% is not supported. Install Node 24 LTS from https://nodejs.org
  goto :fail
)
echo   Node %NODE_MAJOR%.%NODE_MINOR% - OK

echo.
echo [2/3] Installing dependencies (npm ci)...
call npm ci --no-fund
if errorlevel 1 goto :fail

echo.
echo [3/3] Logging the Devvit CLI into Reddit (a browser window will open)...
call npx devvit login
if errorlevel 1 goto :fail

echo.
echo  Setup complete. Next: scripts\play-local.bat  or  scripts\playtest.bat
popd
pause
exit /b 0

:fail
echo.
echo  Setup stopped - read the message above.
popd
pause
exit /b 1
