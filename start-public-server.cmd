@echo off
cd /d "%~dp0"
set NODE_ENV=production
set PORT=3080
echo VVL productie-server op http://localhost:3080
"%ProgramFiles%\nodejs\node.exe" src\backend\server.js
