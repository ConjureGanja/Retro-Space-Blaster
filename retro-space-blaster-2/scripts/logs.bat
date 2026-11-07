@echo off
REM ==========================================================================
REM  logs.bat - stream server logs (console.log/console.error from src/server)
REM  from your installed app. Usage:  scripts\logs.bat my_test_sub
REM ==========================================================================
pushd "%~dp0.."
if "%~1"=="" ( echo Usage: scripts\logs.bat ^<subreddit^> & popd & exit /b 1 )
call npx devvit logs %1
popd
