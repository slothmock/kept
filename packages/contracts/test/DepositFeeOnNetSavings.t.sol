// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StagingUSDC} from "../src/StagingUSDC.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {StagingYieldStrategy} from "../src/StagingYieldStrategy.sol";
import {KeptTreasury} from "../src/KeptTreasury.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DepositFeeOnNetSavingsTest is Test {
    StagingUSDC internal usdc;
    KeptSavingsVault internal vault;
    KeptTreasury internal treasury;
    StagingYieldStrategy internal strategy;

    address internal constant SAVER = address(0xBEEF);

    function setUp() public {
        vm.chainId(31337);
        usdc = new StagingUSDC(address(this));
        treasury = new KeptTreasury(IERC20(address(usdc)), address(this));
        vault = new KeptSavingsVault(IERC20(address(usdc)), address(this), address(treasury));
        strategy = new StagingYieldStrategy(address(vault), address(usdc), 0);
        treasury.bindVault(address(vault));
        vault.bindStrategy(address(strategy));
        usdc.mint(SAVER, 2_000e6);
        vm.prank(SAVER);
        usdc.approve(address(vault), type(uint256).max);
    }

    function testDepositFeeIsTwoUsdcOnOneThousandSaved() public {
        uint256 grossAssets = 1_002e6;

        // Net savings entitlement is exactly 1,000 USDC, not 999.996 USDC.
        uint256 previewShares = vault.previewDeposit(grossAssets);
        assertEq(vault.convertToAssets(previewShares), 1_000e6);

        vm.prank(SAVER);
        uint256 mintedShares = vault.deposit(grossAssets, SAVER);
        assertEq(mintedShares, previewShares);
        assertEq(usdc.balanceOf(SAVER), 998e6);
        assertEq(vault.convertToAssets(vault.balanceOf(SAVER)), 1_000e6);
        assertEq(vault.convertToAssets(vault.balanceOf(address(treasury))), 2e6);
        assertEq(vault.totalAssets(), 1_002e6);
    }

    function testFeeSharePercentageUsesNetAmount() public {
        assertEq(vault.DEPOSIT_FEE_BPS(), 20);
        // Fee shares must be 20 / (10,000 + 20) of the gross shares.
        uint256 grossAssets = 1_002e6;
        uint256 grossShares = vault.convertToShares(grossAssets);
        uint256 expectedFeeShares = grossShares * 20 / 10_020;
        vm.prank(SAVER);
        vault.deposit(grossAssets, SAVER);
        assertEq(vault.balanceOf(address(treasury)), expectedFeeShares);
    }
}
