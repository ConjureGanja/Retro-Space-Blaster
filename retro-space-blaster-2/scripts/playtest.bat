@echo off
REM ==========================================================================
REM  playtest.bat - run the game LIVE inside your private test subreddit.
REM  Builds, uploads a dev version, and watches for changes: save a file and
REM  refresh the Reddit post to see it. Cloud saves + leaderboard work here.
REM  Stop with Ctrl+C.
REM
REM  Test subreddit comes from "dev.subreddit" in devvit.json, or pass one:
REM     scripts\playtest.bat my_test_sub
REM ==========================================================================
pushd "%~dp0.."
if "%~1"=="" (
  call npm run dev
) else (
  call npm run art && call npx devvit playtest %1
)
popd
