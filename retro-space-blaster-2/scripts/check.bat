@echo off
REM ==========================================================================
REM  check.bat - run everything CI runs: types, lint, formatting, unit tests,
REM  then a full production build. Green here = green on GitHub.
REM  Ship It Saturday rule: nothing ships unless this passes.
REM ==========================================================================
pushd "%~dp0.."
call npm run check && call npm run build
if errorlevel 1 (
  echo.
  echo  CHECK FAILED - fix the errors above before pushing.
  popd & pause & exit /b 1
)
echo.
echo  All checks passed.
popd
pause
