@echo off
setlocal

set "UI_DIR=C:\Projek Bryan J\Video Swap UI"
set "API_DIR=C:\Projek Bryan J\Deep-Live-Cam"

echo Starting Video Swap API...
start "Video Swap API" powershell -NoExit -Command "Set-Location -LiteralPath '%API_DIR%'; Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned; if (Test-Path '.\venv\Scripts\Activate.ps1') { . '.\venv\Scripts\Activate.ps1' }; uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Video Swap UI...
start "Video Swap UI" cmd /k "cd /d ""%UI_DIR%"" && npm run dev"

echo.
echo Both services are starting in separate windows.
echo You can edit UI_DIR and API_DIR in this file if the folders move.
pause
