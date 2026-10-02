// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockUSDC} from "./mocks/MockAave.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {StagingYieldStrategy} from "../src/StagingYieldStrategy.sol";

contract StagingYieldStrategyTest is Test {
    MockUSDC internal usdc;
    KeptSavingsVault internal vault;
    StagingYieldStrategy internal strategy;

    address internal user = address(0xBEEF);

    function setUp() public {
        vm.chainId(31337);

        usdc = new MockUSDC();

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
                address(this)
            );

        vault.bindStrategy(address(strategy));

        usdc.mint(user, 100e6);
    }

    function test_DepositWithdrawalAndInjectedYield() public {
        vm.startPrank(user);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6, user);
        vm.stopPrank();

        assertEq(strategy.totalAssets(), 100e6);
        assertEq(vault.totalAssets(), 100e6);

        usdc.mint(address(this), 10e6);
        usdc.approve(address(strategy), 10e6);
        strategy.fundYield(10e6);

        assertEq(strategy.totalAssets(), 110e6);
        assertEq(vault.totalAssets(), 110e6);

        vm.prank(user);
        vault.withdraw(50e6, user, user);

        assertEq(usdc.balanceOf(user), 50e6);
        assertEq(strategy.availableLiquidity(), 60e6);
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
            address(this)
        );
    }
}
