// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {MockUSDC, MockAToken, MockAavePool} from "./mocks/MockAave.sol";

contract VaultScopeTest is Test {
    function test_AutomaticDepositEntrypointIsUnavailable() public {
        MockUSDC token = new MockUSDC();
        MockAToken aToken = new MockAToken(address(token));
        MockAavePool pool = new MockAavePool(token, aToken);
        KeptSavingsVault vault = new KeptSavingsVault(IERC20(address(token)), address(this), address(this), 100, 2_500);
        AaveUSDCStrategy strategy = new AaveUSDCStrategy(address(vault), address(token), address(pool), address(aToken));
        vault.bindStrategy(address(strategy));
        token.mint(address(this), 1e6);
        token.approve(address(vault), type(uint256).max);

        (bool succeeded,) = address(vault).call(abi.encodeWithSignature("depositAutomatically(uint256)", 1e6));

        assertFalse(succeeded);
    }

    function test_VaultSharesRemainStandardTransferableErc20Shares() public {
        MockUSDC token = new MockUSDC();
        MockAToken aToken = new MockAToken(address(token));
        MockAavePool pool = new MockAavePool(token, aToken);
        KeptSavingsVault vault = new KeptSavingsVault(IERC20(address(token)), address(this), address(this), 100, 2_500);
        AaveUSDCStrategy strategy = new AaveUSDCStrategy(address(vault), address(token), address(pool), address(aToken));
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        vault.bindStrategy(address(strategy));
        token.mint(address(this), 1e6);
        token.approve(address(vault), type(uint256).max);

        uint256 shares = vault.deposit(1e6, alice);
        uint256 half = shares / 2;

        vm.prank(alice);
        vault.transfer(bob, half);
        assertEq(vault.balanceOf(bob), half);

        vm.prank(alice);
        vault.approve(address(this), shares - half);
        vault.transferFrom(alice, bob, shares - half);
        assertEq(vault.balanceOf(alice), 0);
        assertEq(vault.balanceOf(bob), shares);
    }
}
