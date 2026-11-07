@echo off
REM ==========================================================================
REM  publish.bat - create a new version and file a publish request with Reddit.
REM  (`devvit publish` uploads for you - no separate deploy step needed.)
REM
REM    UNLISTED (default): anyone can install it via a direct link, it just
REM                        isn't featured in the App Directory.
REM    PUBLIC:             submitted for review to be listed publicly.
REM
REM  Only do this once the game is solid in your test subreddit - each publish
REM  is a new version + a new review request.
REM ==========================================================================
REM  NOTE: EnableDelayedExpansion + !VAR! is required because %VAR% inside
REM  an if ( ... ) block is expanded BEFORE set /p runs (classic .bat trap).
setlocal EnableDelayedExpansion
pushd "%~dp0.."
echo.
echo   1) Unlisted   (recommended first)
echo   2) Public     (listed in the App Directory after review)
echo.
set /p MODE=Choose 1 or 2: 
if "%MODE%"=="1" (
  set /p OK=Type PUBLISH to submit an UNLISTED version: 
  if not "!OK!"=="PUBLISH" ( echo Cancelled. & popd & exit /b 0 )
  call npm run launch
) else if "%MODE%"=="2" (
  set /p OK=Type PUBLIC to submit for PUBLIC review: 
  if not "!OK!"=="PUBLIC" ( echo Cancelled. & popd & exit /b 0 )
  call npm run launch:public
) else (
  echo Cancelled.
)
popd
pause
