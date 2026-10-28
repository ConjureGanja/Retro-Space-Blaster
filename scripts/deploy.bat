@echo off
REM ==========================================================================
REM  deploy.bat - upload a new PRIVATE version of the app to Reddit.
REM  Runs all checks first; refuses to upload if anything fails.
REM  Uploading does NOT make it public - only subreddits where you've
REM  installed it will get the new version. (Use publish.bat for review.)
REM ==========================================================================
pushd "%~dp0.."
echo This will run all checks, then upload a new version with `devvit upload`.
set /p OK=Continue? (y/N) 
if /i not "%OK%"=="y" ( echo Cancelled. & popd & exit /b 0 )
call npm run deploy
popd
pause
