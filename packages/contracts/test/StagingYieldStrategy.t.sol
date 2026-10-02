// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StagingUSDC} from "../src/StagingUSDC.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {StagingYieldStrategy} from "../src/StagingYieldStrategy.sol";

contract StagingYieldStrategyTest is Test {
    StagingUSDC internal usdc;
    KeptSavingsVault internal vault;
    StagingYieldStrategy internal strategy;

    address internal user = address(0xBEEF);

    function setUp() public {
        vm.chainId(31337);

        usdc = new StagingUSDC(address(this));

        vault =
            new KeptSavingsVault(
                IERC20(address(usdc)),
                address(this),
                address(this)
            );

        strategy =
            new StagingYieldStrategy(
                address(vault),
                address(usdc),
                500
            );

        usdc.setMinter(address(strategy), true);
        vault.bindStrategy(address(strategy));

        usdc.mint(user, 100e6);
    }

    function test_AccruesFivePercentAnnualYieldOverOneYear() public {
        vm.startPrank(user);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6, user);
        vm.stopPrank();

        vm.warp(block.timestamp + 365 days);

        assertEq(strategy.previewAccruedYield(), 5e6);
        assertEq(vault.totalAssets(), 105e6);

        strategy.accrueYield();

        assertEq(usdc.balanceOf(address(strategy)), 105e6);
        assertEq(strategy.previewAccruedYield(), 0);
    }

    function test_NewDepositDoesNotReceiveRetroactiveYield() public {
        vm.startPrank(user);
        usdc.approve(address(vault), 100e6);
        vault.deposit(50e6, user);
        vm.stopPrank();

        vm.warp(block.timestamp + 365 days);

        vm.prank(user);
        vault.deposit(50e6, user);

        assertEq(usdc.balanceOf(address(strategy)), 102_500_000);
    }

    function test_AnyoneMayTriggerDeterministicAccrual() public {
        vm.startPrank(user);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6, user);
        vm.stopPrank();

        vm.warp(block.timestamp + 365 days);

        vm.prank(address(0xCAFE));
        strategy.accrueYield();

        assertEq(usdc.balanceOf(address(strategy)), 105e6);
    }

    function test_RejectsProductionChain() public {
        vm.chainId(143);

        vm.expectRevert(
            abi.encodeWithSelector(
                StagingYieldStrategy.UnsupportedChain.selector,
                143
            )
        );

        new StagingYieldStrategy(
            address(vault),
            address(usdc),
            500
        );
    }
}
