@echo off

setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0.."

set "ROOT_DIR=%CD%"
set "PID_DIR=%ROOT_DIR%\.dev-pids"

set "FOUNDRY_BIN=%USERPROFILE%\.foundry\bin"
set "ANVIL=%FOUNDRY_BIN%\anvil.exe"
set "FORGE=%FOUNDRY_BIN%\forge.exe"
set "CAST=%FOUNDRY_BIN%\cast.exe"

set "RPC_URL=http://127.0.0.1:8545"
set "MOCK_USDC=0x5FbDB2315678afecb367f032d93F642f64180aa3"

set "KEPT_TREASURY=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"

if not exist "%PID_DIR%" mkdir "%PID_DIR%"

echo.
echo ==============================
echo  Starting Kept development
echo ==============================
echo.

rem --------------------------------------------------
rem Load root .env into this process
rem --------------------------------------------------

echo Loading environment...

if not exist "%ROOT_DIR%\.env.local" (
    echo ERROR: .env.local not found at:
    echo %ROOT_DIR%\.env.local
    goto :error
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT_DIR%\.env.local") do (
    set "ENV_KEY=%%A"
    set "ENV_VALUE=%%B"

    if defined ENV_KEY (
        if not "!ENV_KEY:~0,1!"=="#" (
            set "!ENV_KEY!=!ENV_VALUE!"
        )
    )
)

if not defined LOCAL_DEPLOYER_PRIVATE_KEY (
    echo ERROR: LOCAL_DEPLOYER_PRIVATE_KEY is not set in .env
    goto :error
)

if not defined LOCAL_COMMITMENT_VERIFIER (
    echo ERROR: LOCAL_COMMITMENT_VERIFIER is not set in .env
    goto :error
)

if not defined LOCAL_TEST_WALLET_ADDRESS (
    echo ERROR: LOCAL_TEST_WALLET_ADDRESS is not set in .env.local
    goto :error
)

echo Environment loaded.

rem --------------------------------------------------
rem Database
rem --------------------------------------------------

echo.
echo Starting database...

call npm run db:up

if errorlevel 1 goto :error

echo.
echo Running migrations...

call npm run db:migrate

if errorlevel 1 goto :error

rem --------------------------------------------------
rem Foundry tools
rem --------------------------------------------------

echo.
echo Checking Foundry tools...

if not exist "%ANVIL%" (
    echo ERROR: Anvil not found at:
    echo %ANVIL%
    goto :error
)

if not exist "%FORGE%" (
    echo ERROR: Forge not found at:
    echo %FORGE%
    goto :error
)

if not exist "%CAST%" (
    echo ERROR: Cast not found at:
    echo %CAST%
    goto :error
)

echo Foundry tools found.

rem --------------------------------------------------
rem Start Anvil
rem --------------------------------------------------

echo.
echo Starting local RPC dev server...

powershell -NoProfile -Command ^
    "$p = Start-Process -FilePath '%ANVIL%' " ^
    "-ArgumentList '--host','127.0.0.1','--port','8545','--chain-id','31337' " ^
    "-WorkingDirectory '%ROOT_DIR%' -PassThru; " ^
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

rem --------------------------------------------------
rem Deploy local contracts
rem --------------------------------------------------

echo.
echo Deploying local contracts...

pushd "%ROOT_DIR%\packages\contracts"

"%FORGE%" script script/DeployLocalVault.s.sol:DeployLocalVault ^
    --rpc-url %RPC_URL% ^
    --broadcast

if errorlevel 1 (
    popd
    echo ERROR: Contract deployment failed.
    goto :error
)

popd

echo Local contracts deployed.

rem --------------------------------------------------
rem Verify deployment
rem --------------------------------------------------

echo.
echo Verifying local contract deployment...

set "USDC_CODE="

for /f "delims=" %%i in ('"%CAST%" code %MOCK_USDC% --rpc-url %RPC_URL%') do (
    set "USDC_CODE=%%i"
)

if not defined USDC_CODE (
    echo ERROR: Could not read MockUSDC contract code.
    goto :error
)

if "%USDC_CODE%"=="0x" (
    echo ERROR: MockUSDC was not deployed at:
    echo %MOCK_USDC%
    goto :error
)

echo Contracts verified.

rem --------------------------------------------------
rem Fund local test wallet with gas
rem --------------------------------------------------

echo.
echo Funding local test wallet with gas...

"%CAST%" send %LOCAL_TEST_WALLET_ADDRESS% ^
    --value 10ether ^
    --private-key %LOCAL_DEPLOYER_PRIVATE_KEY% ^
    --rpc-url %RPC_URL%

if errorlevel 1 (
    echo ERROR: Failed to fund local test wallet with gas.
    goto :error
)

echo Funded local test wallet with 10 ETH for gas.

rem --------------------------------------------------
rem Mint local test USDC
rem --------------------------------------------------

echo.
echo Minting local test USDC...

set "LOCAL_TEST_USDC=1000000000"

"%CAST%" send %MOCK_USDC% ^
    "mint(address,uint256)" ^
    %LOCAL_TEST_WALLET_ADDRESS% ^
    %LOCAL_TEST_USDC% ^
    --private-key %LOCAL_DEPLOYER_PRIVATE_KEY% ^
    --rpc-url %RPC_URL%

if errorlevel 1 (
    echo ERROR: Failed to mint local test USDC.
    goto :error
)

echo Minted 1000 USDC to:
echo %LOCAL_TEST_WALLET_ADDRESS%

echo.

rem --------------------------------------------------
rem Fund reward treasury
rem --------------------------------------------------

echo.
echo Funding reward treasury...

set "LOCAL_TREASURY_USDC=100000000"

"%CAST%" send %MOCK_USDC% "mint(address,uint256)" %KEPT_TREASURY% %LOCAL_TREASURY_USDC% --private-key %LOCAL_DEPLOYER_PRIVATE_KEY% --rpc-url %RPC_URL%
"%CAST%" call %MOCK_USDC% "balanceOf(address)(uint256)" %KEPT_TREASURY% --rpc-url %RPC_URL%

if errorlevel 1 (
    echo ERROR: Failed to fund reward treasury.
    goto :error
)


echo Funded reward treasury with 100 USDC.

rem --------------------------------------------------
rem Start API
rem --------------------------------------------------

echo.
echo Starting API server...

powershell -NoProfile -Command ^
    "$p = Start-Process -FilePath 'cmd.exe' " ^
    "-ArgumentList '/k','npm run api:dev' " ^
    "-WorkingDirectory '%ROOT_DIR%' -PassThru; " ^
    "Set-Content -Path '%PID_DIR%\api.pid' -Value $p.Id"

if errorlevel 1 goto :error

rem --------------------------------------------------
rem Start web app
rem --------------------------------------------------

echo.
echo Starting Webapp...

powershell -NoProfile -Command ^
    "$p = Start-Process -FilePath 'cmd.exe' " ^
    "-ArgumentList '/k','npm run dev --workspace @kept/web' " ^
    "-WorkingDirectory '%ROOT_DIR%' -PassThru; " ^
    "Set-Content -Path '%PID_DIR%\web.pid' -Value $p.Id"

if errorlevel 1 goto :error

rem --------------------------------------------------
rem Success
rem --------------------------------------------------

echo.
echo ==============================
echo  Kept development environment
echo  started successfully.
echo ==============================
echo.

echo Process IDs:

echo RPC:
type "%PID_DIR%\rpc.pid"

echo API:
type "%PID_DIR%\api.pid"

echo WEB:
type "%PID_DIR%\web.pid"

exit /b 0

rem --------------------------------------------------
rem Failure
rem --------------------------------------------------

:error

echo.
echo ==============================
echo  Failed to start Kept.
echo ==============================
echo.

exit /b 1