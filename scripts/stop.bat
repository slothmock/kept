@echo off
setlocal

cd /d "%~dp0.."

set "PID_DIR=%CD%\.dev-pids"

echo.
echo ==============================
echo  Stopping Kept development
echo ==============================

call :kill_process web "Webapp"
call :kill_process api "API server"
call :kill_process rpc "Local RPC"

echo.
echo Stopping database...
call npm run db:down

if errorlevel 1 (
    echo WARNING: Database shutdown returned an error.
)

echo.
echo ==============================
echo  Kept development environment
echo  stopped.
echo ==============================
echo.

exit /b 0


:kill_process

set "PROCESS_NAME=%~1"
set "DISPLAY_NAME=%~2"
set "PID_FILE=%PID_DIR%\%PROCESS_NAME%.pid"

if not exist "%PID_FILE%" (
    echo %DISPLAY_NAME%: no PID file found.
    exit /b 0
)

set /p PROCESS_PID=<"%PID_FILE%"

if "%PROCESS_PID%"=="" (
    echo %DISPLAY_NAME%: invalid PID file.
    del "%PID_FILE%" >nul 2>&1
    exit /b 0
)

echo Stopping %DISPLAY_NAME% [PID %PROCESS_PID%]...

taskkill /PID %PROCESS_PID% /T /F >nul 2>&1

if errorlevel 1 (
    echo %DISPLAY_NAME% was already stopped or PID is stale.
) else (
    echo %DISPLAY_NAME% stopped.
)

del "%PID_FILE%" >nul 2>&1

exit /b 0