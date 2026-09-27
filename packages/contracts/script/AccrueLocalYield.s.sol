// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {MockAToken} from "../test/mocks/MockAave.sol";

/// @notice Local-only helper for simulating Aave yield.
/// @dev Must never be used against Monad.
contract AccrueLocalYield is Script {
    error UnsupportedLocalChain(uint256 chainId);
    error InvalidStrategy();
    error InvalidAToken();
    error StrategyATokenMismatch();
    error ZeroYield();

    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant USDC_SCALE = 1e6;

    function assertLocalChain() public view {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert UnsupportedLocalChain(block.chainid);
        }
    }

    function run() external {
        assertLocalChain();

        uint256 deployerPrivateKey = vm.envUint("LOCAL_DEPLOYER_PRIVATE_KEY");

        address strategyAddress = vm.envAddress("LOCAL_KEPT_STRATEGY");

        address aTokenAddress = vm.envAddress("LOCAL_AAVE_ATOKEN");

        // Whole USDC for local development:
        // LOCAL_YIELD_USDC=10 => 10 USDC of simulated yield.
        uint256 yieldUsdc = vm.envOr("LOCAL_YIELD_USDC", uint256(10));

        if (strategyAddress == address(0) || strategyAddress.code.length == 0) {
            revert InvalidStrategy();
        }

        if (aTokenAddress == address(0) || aTokenAddress.code.length == 0) {
            revert InvalidAToken();
        }

        if (yieldUsdc == 0) {
            revert ZeroYield();
        }

        AaveUSDCStrategy strategy = AaveUSDCStrategy(strategyAddress);

        MockAToken aToken = MockAToken(aTokenAddress);

        if (address(strategy.aToken()) != aTokenAddress) {
            revert StrategyATokenMismatch();
        }

        uint256 yieldAmount = yieldUsdc * USDC_SCALE;

        uint256 assetsBefore = strategy.totalAssets();

        vm.startBroadcast(deployerPrivateKey);

        aToken.accrueYield(strategyAddress, yieldAmount);

        vm.stopBroadcast();

        uint256 assetsAfter = strategy.totalAssets();

        console2.log("LOCAL_YIELD_USDC", yieldUsdc);

        console2.log("STRATEGY_ASSETS_BEFORE", assetsBefore);

        console2.log("STRATEGY_ASSETS_AFTER", assetsAfter);

        console2.log("YIELD_ADDED_ATOMIC", yieldAmount);
    }
}
