@echo off
REM ==========================================================================
REM  play-local.bat - play the game in your normal browser, no Reddit needed.
REM  Opens http://localhost:5173/game.html with hot reload (save a file ->
REM  the page updates). Progress saves to this browser only (localStorage).
REM  Stop with Ctrl+C.
REM ==========================================================================
pushd "%~dp0.."
call npm run local
popd
