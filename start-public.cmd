@echo off
setlocal
cd /d "%~dp0"
title VVL Planning — vaste publieke link

echo.
echo === VVL Planning App — publieke link ===
echo.
echo Dit is een CMD-venster, geen browserpagina.
echo Als je .cmd in Cursor opent: sluit dat en dubbelklik het bestand in Verkenner.
echo.

call "%ProgramFiles%\nodejs\npm.cmd" run build
if errorlevel 1 (
  echo.
  echo BUILD MISLUKT — los npm-fouten hierboven op.
  pause
  exit /b 1
)

call "%ProgramFiles%\nodejs\npm.cmd" install --no-save localtunnel
if errorlevel 1 (
  echo.
  echo localtunnel installeren mislukt.
  pause
  exit /b 1
)

echo.
echo Productie-server starten op poort 3080...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3080 ^| findstr LISTENING') do (
  echo Oude server op poort 3080 stoppen PID %%a...
  taskkill /F /PID %%a >nul 2>&1
)
start "VVL-Public-API" /D "%~dp0" cmd /c call "%~dp0start-public-server.cmd"

echo Wachten tot server klaar is...
timeout /t 4 /nobreak >nul

curl.exe -s -o NUL -w "Health check: HTTP %%{http_code}\n" http://127.0.0.1:3080/api/health 2>nul
if errorlevel 1 (
  echo WAARSCHUWING: poort 3080 reageert nog niet. Controleer venster "VVL-Public-API".
)

echo.
echo Tunnel starten naar https://vvllekkerkerk-planning.loca.lt
echo (localtunnel — bij eerste bezoek soms op Continue klikken)
echo.
set TUNNEL_PORT=3080
set TUNNEL_SUBDOMAIN=vvllekkerkerk-planning
"%ProgramFiles%\nodejs\node.exe" scripts\stable-tunnel.mjs

echo.
echo Tunnel gestopt — de publieke link werkt niet meer.
pause
