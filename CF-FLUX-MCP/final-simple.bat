@echo off
echo Starting Simple Flux MCP Server...

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js not found! Please install Node.js first.
  pause
  exit /b 1
)

:: Display current path for reference
echo Current directory: %CD%
echo.

:: Display the command that will be executed in Cursor
echo To configure in Cursor, use this EXACT command:
echo node "%CD%\simple-server-final.js"
echo.

:: Ensure FLUX_TOKEN is set before launching the server (matches the fail-fast guard inside the script)
if "%FLUX_TOKEN%"=="" (
  echo [ERROR] FLUX_TOKEN env var is not set. Set it with: set FLUX_TOKEN=your-token
  echo         Or configure it in Cursor MCP under "env": { "FLUX_TOKEN": "..." }.
  pause
  exit /b 1
)

:: Run the server
node simple-server-final.js 