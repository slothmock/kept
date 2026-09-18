// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {MockUSDC, MockAToken, MockAavePool} from "./mocks/MockAave.sol";

contract VaultScopeTest is Test {
    function _deploy() internal returns (MockUSDC token, KeptSavingsVault vault) {
        token = new MockUSDC();
        MockAToken aToken = new MockAToken(address(token));
        MockAavePool pool = new MockAavePool(token, aToken);
        vault = new KeptSavingsVault(IERC20(address(token)), address(this), address(this));
        AaveUSDCStrategy strategy = new AaveUSDCStrategy(address(vault), address(token), address(pool), address(aToken));
        vault.bindStrategy(address(strategy));
    }

    function test_AutomaticDepositEntrypointIsUnavailable() public {
        (MockUSDC token, KeptSavingsVault vault) = _deploy();
        token.mint(address(this), 1e6);
        token.approve(address(vault), type(uint256).max);

        (bool succeeded,) = address(vault).call(abi.encodeWithSignature("depositAutomatically(uint256)", 1e6));
        assertFalse(succeeded);
    }

    function test_PublicMintIsDisabled() public {
        (, KeptSavingsVault vault) = _deploy();
        vm.expectRevert(KeptSavingsVault.MintDisabled.selector);
        vault.mint(1e18, address(this));
        assertEq(vault.maxMint(address(this)), 0);
    }

    function test_VaultSharesCannotBeTransferredOrTransferFrom() public {
        (MockUSDC token, KeptSavingsVault vault) = _deploy();
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");

        token.mint(alice, 100e6);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        uint256 shares = vault.deposit(100e6, alice);

        vm.prank(alice);
        vm.expectRevert(KeptSavingsVault.ShareTransfersDisabled.selector);
        vault.transfer(bob, shares / 2);

        vm.prank(alice);
        vault.approve(address(this), shares);
        vm.expectRevert(KeptSavingsVault.ShareTransfersDisabled.selector);
        vault.transferFrom(alice, bob, shares);
    }
}
