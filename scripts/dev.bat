@echo off
setlocal

cd /d "%~dp0.."

set "PID_DIR=%CD%\.dev-pids"
set "ANVIL=%USERPROFILE%\.foundry\bin\anvil.exe"

if not exist "%PID_DIR%" mkdir "%PID_DIR%"

echo.
echo ==============================
echo  Starting Kept development
echo ==============================

echo.
echo Starting database...
call npm run db:up
if errorlevel 1 goto :error

echo.
echo Running migrations...
call npm run db:migrate
if errorlevel 1 goto :error

echo.
echo Starting local RPC dev server...

if not exist "%ANVIL%" (
    echo ERROR: Anvil not found at:
    echo %ANVIL%
    goto :error
)

powershell -NoProfile -Command ^
    "$p = Start-Process -FilePath '%ANVIL%' " ^
    "-ArgumentList '--host','127.0.0.1','--port','8545','--chain-id','31337' " ^
    "-WorkingDirectory '%CD%' -PassThru; " ^
    "Set-Content -Path '%PID_DIR%\rpc.pid' -Value $p.Id"

if errorlevel 1 goto :error

echo Waiting for local RPC...

powershell -NoProfile -Command ^
    "$deadline = (Get-Date).AddSeconds(10); " ^
    "while ((Get-Date) -lt $deadline) { " ^
    "  try { " ^
    "    $client = New-Object Net.Sockets.TcpClient; " ^
    "    $client.Connect('127.0.0.1', 8545); " ^
    "    $client.Close(); " ^
    "    exit 0 " ^
    "  } catch { " ^
    "    Start-Sleep -Milliseconds 250 " ^
    "  } " ^
    "}; exit 1"

if errorlevel 1 (
    echo ERROR: Local RPC did not start.
    goto :error
)

echo RPC ready.

echo.
echo Starting API server...

powershell -NoProfile -Command ^
    "$p = Start-Process -FilePath 'cmd.exe' " ^
    "-ArgumentList '/k','npm run api:dev' " ^
    "-WorkingDirectory '%CD%' -PassThru; " ^
    "Set-Content -Path '%PID_DIR%\api.pid' -Value $p.Id"

if errorlevel 1 goto :error

echo.
echo Starting Webapp...

powershell -NoProfile -Command ^
    "$p = Start-Process -FilePath 'cmd.exe' " ^
    "-ArgumentList '/k','npm run dev --workspace @kept/web' " ^
    "-WorkingDirectory '%CD%' -PassThru; " ^
    "Set-Content -Path '%PID_DIR%\web.pid' -Value $p.Id"

if errorlevel 1 goto :error

echo.
echo ==============================
echo  Kept development environment
echo  started successfully.
echo ==============================
echo.

echo Process IDs:
type "%PID_DIR%\rpc.pid"
type "%PID_DIR%\api.pid"
type "%PID_DIR%\web.pid"

exit /b 0

:error

echo.
echo ==============================
echo  Failed to start Kept.
echo ==============================
echo.

exit /b 1