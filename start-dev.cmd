@echo off
cd /d "%~dp0"
echo VVL Planning App starten...
echo Browser: http://localhost:5173
echo Stoppen met Ctrl+C
echo.
call "%ProgramFiles%\nodejs\npm.cmd" run dev
