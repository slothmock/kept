// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {MockUSDC, MockWrongDecimalsToken, MockAToken, MockAavePool} from "./mocks/MockAave.sol";

contract WrongAssetStrategy is IYieldStrategy {
    address public immutable override vault;
    address public immutable override asset;

    constructor(address vault_, address asset_) {
        vault = vault_;
        asset = asset_;
    }

    function deposit(uint256 assets) external pure returns (uint256) {
        return assets;
    }

    function withdraw(uint256 assets) external pure returns (uint256) {
        return assets;
    }

    function totalAssets() external pure returns (uint256) {
        return 0;
    }

    function availableLiquidity() external pure returns (uint256) {
        return 0;
    }
}

contract VaultAndStrategyTest is Test {
    uint256 internal constant USDC = 1e6;

    MockUSDC internal token;
    MockAToken internal aToken;
    MockAavePool internal pool;
    KeptSavingsVault internal vault;
    AaveUSDCStrategy internal strategy;

    address internal owner = makeAddr("owner");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new MockUSDC();
        aToken = new MockAToken(address(token));
        pool = new MockAavePool(token, aToken);
        vault = new KeptSavingsVault(IERC20(address(token)), owner, feeRecipient);
        strategy = new AaveUSDCStrategy(address(vault), address(token), address(pool), address(aToken));

        vm.prank(owner);
        vault.bindStrategy(address(strategy));

        token.mint(alice, 10_000 * USDC);
        token.mint(bob, 10_000 * USDC);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    function test_FirstDepositSuppliesAllAssetsAndSplitsShares() public {
        uint256 preview = vault.previewDeposit(100 * USDC);
        vm.prank(alice);
        uint256 userShares = vault.deposit(100 * USDC, alice);

        uint256 treasuryShares = vault.balanceOf(feeRecipient);
        assertEq(userShares, preview);
        assertEq(vault.decimals(), 12);
        assertGt(treasuryShares, 0);
        assertEq(vault.totalSupply(), userShares + treasuryShares);
        assertEq(aToken.balanceOf(address(strategy)), 100 * USDC);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(vault.totalAssets(), 100 * USDC);

        uint256 feeBps = treasuryShares * 10_000 / vault.totalSupply();
        assertApproxEqAbs(feeBps, 20, 1);
    }

    function test_MultipleUsersRemainFairAfterYield() public {
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        aToken.accrueYield(address(strategy), 20 * USDC);

        uint256 aliceValueBefore = vault.convertToAssets(vault.balanceOf(alice));
        uint256 expectedBobShares = vault.previewDeposit(120 * USDC);

        vm.prank(bob);
        uint256 bobShares = vault.deposit(120 * USDC, bob);

        assertEq(bobShares, expectedBobShares);
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(alice)), aliceValueBefore, 2);
        assertEq(vault.totalAssets(), 240 * USDC);
        assertLt(vault.convertToAssets(bobShares), 120 * USDC);
    }

    function test_MintDisabledButWithdrawAndRedeemWork() public {
        vm.prank(alice);
        vm.expectRevert(KeptSavingsVault.MintDisabled.selector);
        vault.mint(1e18, alice);

        vm.prank(alice);
        vault.deposit(200 * USDC, alice);

        uint256 balanceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw(50 * USDC, alice, alice);
        assertEq(token.balanceOf(alice), balanceBefore + 50 * USDC);

        uint256 remaining = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 redeemed = vault.redeem(remaining, alice, alice);
        assertGt(redeemed, 0);
        assertEq(vault.balanceOf(alice), 0);
    }

    function test_IdleVaultDonationIsIncludedInTotalAssets() public {
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        token.mint(address(vault), 7 * USDC);
        assertEq(vault.totalAssets(), 107 * USDC);
    }

    function test_DonationCannotExtractVictimDepositProfit() public {
        uint256 attackerBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.deposit(1, alice);
        vm.prank(alice);
        token.transfer(address(vault), 1_000 * USDC);

        vm.prank(bob);
        vault.deposit(1_000 * USDC, bob);

        uint256 attackerShares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(attackerShares, alice, alice);
        assertLe(token.balanceOf(alice), attackerBefore);
    }

    function test_DepositRejectsBeforeStrategyBindingAndMintStillDisabled() public {
        KeptSavingsVault unbound = new KeptSavingsVault(IERC20(address(token)), owner, feeRecipient);
        vm.prank(alice);
        token.approve(address(unbound), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert(KeptSavingsVault.StrategyNotBound.selector);
        unbound.deposit(1, alice);

        vm.prank(alice);
        vm.expectRevert(KeptSavingsVault.MintDisabled.selector);
        unbound.mint(1, alice);
    }

    function test_StrategyBindingIsOwnerOnlyOneTimeAndMatchingAsset() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.bindStrategy(address(strategy));

        vm.prank(owner);
        vm.expectRevert(KeptSavingsVault.StrategyAlreadyBound.selector);
        vault.bindStrategy(address(strategy));

        KeptSavingsVault otherVault = new KeptSavingsVault(IERC20(address(token)), owner, feeRecipient);
        MockUSDC other = new MockUSDC();
        WrongAssetStrategy wrong = new WrongAssetStrategy(address(otherVault), address(other));
        vm.prank(owner);
        vm.expectRevert(KeptSavingsVault.StrategyAssetMismatch.selector);
        otherVault.bindStrategy(address(wrong));
    }

    function test_StrategyConstructedForAnotherVaultCannotBeBound() public {
        KeptSavingsVault intendedVault = new KeptSavingsVault(IERC20(address(token)), owner, feeRecipient);
        KeptSavingsVault wrongVault = new KeptSavingsVault(IERC20(address(token)), owner, feeRecipient);
        AaveUSDCStrategy wrongVaultStrategy =
            new AaveUSDCStrategy(address(wrongVault), address(token), address(pool), address(aToken));

        vm.prank(owner);
        vm.expectRevert(KeptSavingsVault.StrategyVaultMismatch.selector);
        intendedVault.bindStrategy(address(wrongVaultStrategy));
    }

    function test_ConstructorValidationRejectsInvalidComponents() public {
        vm.expectRevert(KeptSavingsVault.InvalidAsset.selector);
        new KeptSavingsVault(IERC20(address(0)), owner, feeRecipient);

        vm.expectRevert(KeptSavingsVault.InvalidFeeConfiguration.selector);
        new KeptSavingsVault(IERC20(address(token)), owner, address(0));

        vm.expectRevert(AaveUSDCStrategy.InvalidAsset.selector);
        new AaveUSDCStrategy(address(vault), address(0), address(pool), address(aToken));
        vm.expectRevert(AaveUSDCStrategy.InvalidAavePool.selector);
        new AaveUSDCStrategy(address(vault), address(token), address(0), address(aToken));
        vm.expectRevert(AaveUSDCStrategy.InvalidAToken.selector);
        new AaveUSDCStrategy(address(vault), address(token), address(pool), address(0));

        MockUSDC other = new MockUSDC();
        MockAToken wrongUnderlyingAToken = new MockAToken(address(other));
        vm.expectRevert(AaveUSDCStrategy.ATokenAssetMismatch.selector);
        new AaveUSDCStrategy(address(vault), address(token), address(pool), address(wrongUnderlyingAToken));

        MockAToken sameUnderlyingWrongReserve = new MockAToken(address(token));
        vm.expectRevert(AaveUSDCStrategy.ATokenPoolMismatch.selector);
        new AaveUSDCStrategy(address(vault), address(token), address(pool), address(sameUnderlyingWrongReserve));
    }

    function test_VaultAndStrategyRejectNonSixDecimalAssets() public {
        MockWrongDecimalsToken wrongDecimals = new MockWrongDecimalsToken();
        MockAToken wrongDecimalsAToken = new MockAToken(address(wrongDecimals));

        vm.expectRevert(KeptSavingsVault.InvalidAsset.selector);
        new KeptSavingsVault(IERC20(address(wrongDecimals)), owner, feeRecipient);

        vm.expectRevert(AaveUSDCStrategy.InvalidAsset.selector);
        new AaveUSDCStrategy(address(vault), address(wrongDecimals), address(pool), address(wrongDecimalsAToken));
    }

    function test_PauseBlocksDepositsButNeverWithdrawOrRedeem() public {
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        vm.prank(owner);
        vault.pause();

        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(1, bob);

        vm.prank(alice);
        vault.withdraw(40 * USDC, alice, alice);
        uint256 pausedShares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(pausedShares, alice, alice);
        assertEq(vault.balanceOf(alice), 0);
    }

    function test_OnlyOwnerCanPauseAndUnpause() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.pause();
        vm.prank(owner);
        vault.pause();
        vm.prank(owner);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_OnlyVaultCanMoveStrategyAssets() public {
        token.mint(address(strategy), 1 * USDC);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AaveUSDCStrategy.UnauthorizedVaultCaller.selector, alice));
        strategy.deposit(1 * USDC);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AaveUSDCStrategy.UnauthorizedVaultCaller.selector, alice));
        strategy.withdraw(1 * USDC);
    }

    function test_StrategyUsesPoolAllowanceAndReflectsYield() public {
        assertEq(token.allowance(address(strategy), address(pool)), type(uint256).max);
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        aToken.accrueYield(address(strategy), 5 * USDC);
        assertEq(strategy.totalAssets(), 105 * USDC);
        assertEq(vault.totalAssets(), 105 * USDC);
    }

    function test_StrategyUsesIdleFirstAndReturnsExactAssetsOnlyToVault() public {
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        token.mint(address(strategy), 10 * USDC);
        vm.prank(alice);
        vault.withdraw(15 * USDC, alice, alice);
        assertEq(aToken.balanceOf(address(strategy)), 95 * USDC);
        assertEq(token.balanceOf(address(strategy)), 0);
    }

    function test_AvailableLiquidityAndMaxWithdrawReflectReserveCash() public {
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        aToken.removeLiquidity(bob, 60 * USDC);
        assertEq(strategy.availableLiquidity(), 40 * USDC);
        assertLe(vault.maxWithdraw(alice), 40 * USDC);

        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(41 * USDC, alice, alice);
    }

    function test_UnexpectedAaveWithdrawAmountRevertsAtomically() public {
        vm.prank(alice);
        vault.deposit(10 * USDC, alice);
        pool.setReturnWrongWithdrawAmount(true);
        uint256 sharesBefore = vault.balanceOf(alice);

        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(1 * USDC, alice, alice);
        assertEq(vault.balanceOf(alice), sharesBefore);
    }

    function test_FailedSupplyRevertsEntireDeposit() public {
        pool.setFailSupply(true);
        uint256 aliceBefore = token.balanceOf(alice);
        uint256 treasuryBefore = vault.balanceOf(feeRecipient);

        vm.prank(alice);
        vm.expectRevert(bytes("SUPPLY_FAILED"));
        vault.deposit(100 * USDC, alice);

        assertEq(token.balanceOf(alice), aliceBefore);
        assertEq(vault.balanceOf(alice), 0);
        assertEq(vault.balanceOf(feeRecipient), treasuryBefore);
        assertEq(vault.totalAssets(), 0);
    }

    function test_OwnerHasNoSaverFundSeizureFunction() public {
        vm.prank(alice);
        vault.deposit(10 * USDC, alice);
        vm.prank(owner);
        (bool ok,) = address(vault)
            .call(abi.encodeWithSignature("rescueTokens(address,address,uint256)", address(token), owner, 10 * USDC));
        assertFalse(ok);
    }

    function test_StrategyCannotRescueUnderlyingOrAToken() public {
        vm.prank(alice);
        vault.deposit(10 * USDC, alice);

        vm.prank(address(vault));
        vm.expectRevert(AaveUSDCStrategy.ProtectedToken.selector);
        strategy.rescueToken(address(token), owner);

        vm.prank(address(vault));
        vm.expectRevert(AaveUSDCStrategy.ProtectedToken.selector);
        strategy.rescueToken(address(aToken), owner);
    }

    function test_StrategyRescueRejectsInvalidAddresses() public {
        vm.prank(address(vault));
        vm.expectRevert(AaveUSDCStrategy.InvalidRescueToken.selector);
        strategy.rescueToken(address(0), owner);

        vm.prank(address(vault));
        vm.expectRevert(AaveUSDCStrategy.InvalidRescueRecipient.selector);
        strategy.rescueToken(address(pool), address(0));
    }

    function testFuzz_DepositThenRedeemChargesOnlyEntryFeeAbsentYield(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1 * USDC, 1_000 * USDC);
        token.mint(alice, amount);
        vm.prank(alice);
        uint256 shares = vault.deposit(amount, alice);
        uint256 expected = vault.previewRedeem(shares);

        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);
        assertEq(assets, expected);
        assertLt(assets, amount);
        // The 20 bps fee is charged on net savings, so the user's
        // gross-deposit share is 10,000 / 10,020 absent yield.
        assertApproxEqAbs(assets, amount * 10_000 / 10_020, 2);
    }
}
