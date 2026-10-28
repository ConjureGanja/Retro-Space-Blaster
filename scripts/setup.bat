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
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo   Node %NODE_MAJOR% is too old. Need 22.12+ ^(24 LTS recommended^).
  goto :fail
)
echo   Node major version %NODE_MAJOR% - OK

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
