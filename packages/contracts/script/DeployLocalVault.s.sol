// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {MockUSDC, MockAToken, MockAavePool} from "../test/mocks/MockAave.sol";

/// @notice Local-only deployment for exercising the Kept vault vertical slice.
/// @dev This deploys deterministic mocks and must never be used for Monad deployment.
contract DeployLocalVault is Script {
    error UnsupportedLocalChain(uint256 chainId);

    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    function assertLocalChain() public view {
        if (block.chainid != ANVIL_CHAIN_ID) revert UnsupportedLocalChain(block.chainid);
    }

    function run()
        external
        returns (MockUSDC usdc, MockAToken aToken, MockAavePool pool, KeptSavingsVault vault, AaveUSDCStrategy strategy)
    {
        assertLocalChain();
        address owner = vm.envAddress("LOCAL_VAULT_OWNER");

        vm.startBroadcast(owner);
        usdc = new MockUSDC();
        aToken = new MockAToken(address(usdc));
        pool = new MockAavePool(usdc, aToken);
        vault = new KeptSavingsVault(IERC20(address(usdc)), owner, owner, 100, 2_500);
        strategy = new AaveUSDCStrategy(address(vault), address(usdc), address(pool), address(aToken));
        vault.bindStrategy(address(strategy));
        vm.stopBroadcast();

        console2.log("LOCAL_USDC", address(usdc));
        console2.log("LOCAL_AAVE_ATOKEN", address(aToken));
        console2.log("LOCAL_AAVE_POOL", address(pool));
        console2.log("LOCAL_KEPT_VAULT", address(vault));
        console2.log("LOCAL_KEPT_STRATEGY", address(strategy));
    }
}
