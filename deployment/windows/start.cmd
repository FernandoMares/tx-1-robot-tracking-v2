@echo off
setlocal

cd /d "%~dp0"

if not defined TRACKING_API_PROXY_TARGET set "TRACKING_API_PROXY_TARGET=http://localhost:8085"
if not defined PORT set "PORT=3000"
set "HOSTNAME=0.0.0.0"

echo Starting TX1 Tracking HMI...
echo URL: http://localhost:%PORT%
echo Tracking API target: %TRACKING_API_PROXY_TARGET%
echo.

node server.js
set "APP_EXIT_CODE=%ERRORLEVEL%"

if not "%APP_EXIT_CODE%"=="0" (
  echo.
  echo TX1 Tracking HMI stopped with exit code %APP_EXIT_CODE%.
)

exit /b %APP_EXIT_CODE%
