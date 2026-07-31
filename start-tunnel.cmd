@echo off
cd /d "%~dp0"
echo.
echo === Cloudflare tunnel (tijdelijke link) ===
echo.
echo FOUT "503 Tunnel Unavailable"? = deze oude link is dood. Start dit script opnieuw
echo en gebruik de NIEUWE https://....trycloudflare.com URL uit de output.
echo.
echo Vereist: app moet lokaal draaien (start-dev.cmd in een ander venster).
echo.

curl.exe -s -o NUL -w "Check localhost:5173 ... HTTP %%{http_code}\n" http://localhost:5173/ 2>nul
if errorlevel 1 (
  echo WAARSCHUWING: geen reactie op poort 5173. Start eerst start-dev.cmd
  echo.
)

echo Tunnel starten naar http://localhost:5173 ...
echo Sluit dit venster NIET als anderen de link gebruiken.
echo.
npx --yes cloudflared tunnel --url http://localhost:5173
pause
