@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install Node.js 24 LTS from https://nodejs.org/
  echo Then double-click Start-Kinnso.cmd again.
  pause
  exit /b 1
)
node "%~dp0launcher.mjs"
if errorlevel 1 pause
