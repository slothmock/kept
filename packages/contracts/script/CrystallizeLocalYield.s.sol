// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";

contract CrystallizeLocalYield is Script {
    error UnsupportedLocalChain(uint256 chainId);
    error InvalidVault();

    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    function run() external {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert UnsupportedLocalChain(block.chainid);
        }

        address vaultAddress = vm.envAddress("VITE_KEPT_VAULT_ADDRESS");

        if (vaultAddress == address(0) || vaultAddress.code.length == 0) {
            revert InvalidVault();
        }

        uint256 deployerPrivateKey = vm.envUint("LOCAL_DEPLOYER_PRIVATE_KEY");

        KeptSavingsVault vault = KeptSavingsVault(vaultAddress);

        vm.startBroadcast(deployerPrivateKey);

        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();

        vm.stopBroadcast();

        console2.log("PERFORMANCE_FEE_ASSETS_USDC_ATOMIC", feeAssets);

        console2.log("PERFORMANCE_FEE_SHARES", feeShares);
    }
}
