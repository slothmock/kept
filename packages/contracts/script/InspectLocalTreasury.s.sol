// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {KeptTreasury} from "../src/KeptTreasury.sol";

contract InspectLocalTreasury is Script {
    error UnsupportedLocalChain(uint256 chainId);
    error InvalidTreasury();
    error InvalidVault();

    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    function run() external view {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert UnsupportedLocalChain(block.chainid);
        }

        address treasuryAddress = vm.envAddress("VITE_KEPT_TREASURY_ADDRESS");

        address vaultAddress = vm.envAddress("VITE_KEPT_VAULT_ADDRESS");

        if (treasuryAddress == address(0) || treasuryAddress.code.length == 0) {
            revert InvalidTreasury();
        }

        if (vaultAddress == address(0) || vaultAddress.code.length == 0) {
            revert InvalidVault();
        }

        KeptTreasury treasury = KeptTreasury(treasuryAddress);

        KeptSavingsVault vault = KeptSavingsVault(vaultAddress);

        IERC20 usdc = IERC20(vault.asset());

        uint256 treasuryShares = vault.balanceOf(treasuryAddress);

        uint256 treasuryVaultAssets = vault.convertToAssets(treasuryShares);

        uint256 treasuryIdleUsdc = usdc.balanceOf(treasuryAddress);

        uint256 treasuryTotalValue = treasuryVaultAssets + treasuryIdleUsdc;

        console2.log("TREASURY", treasuryAddress);

        console2.log("TREASURY_VAULT_SHARES", treasuryShares);

        console2.log("TREASURY_VAULT_VALUE_USDC_ATOMIC", treasuryVaultAssets);

        console2.log("TREASURY_IDLE_USDC_ATOMIC", treasuryIdleUsdc);

        console2.log("TREASURY_TOTAL_VALUE_USDC_ATOMIC", treasuryTotalValue);

        console2.log("VAULT_TOTAL_ASSETS_USDC_ATOMIC", vault.totalAssets());

        console2.log("VAULT_TOTAL_SUPPLY", vault.totalSupply());
    }
}
