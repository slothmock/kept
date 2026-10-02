// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {MockUSDC, MockAToken, MockAavePool} from "./mocks/MockAave.sol";

contract YieldFeesTest is Test {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant BPS = 10_000;

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

    function test_DepositFeeIsTwentyBasisPointsOfGrossShares() public {
        uint256 grossShares = vault.convertToShares(1_000 * USDC);
        uint256 expectedUserShares = vault.previewDeposit(1_000 * USDC);
        uint256 expectedFeeShares = grossShares - expectedUserShares;

        vm.prank(alice);
        uint256 userShares = vault.deposit(1_000 * USDC, alice);

        assertEq(userShares, expectedUserShares);
        assertEq(vault.balanceOf(feeRecipient), expectedFeeShares);
        assertEq(vault.totalSupply(), grossShares);
        assertEq(aToken.balanceOf(address(strategy)), 1_000 * USDC);
        assertEq(vault.totalAssets(), 1_000 * USDC);
        assertApproxEqAbs(expectedFeeShares * BPS / grossShares, 20, 1);
    }

    function test_DepositFeeDoesNotRemoveAssetsFromStrategy() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(address(strategy)), 0);
        assertEq(aToken.balanceOf(address(strategy)), 1_000 * USDC);
    }

    function test_YieldFeeIsTenPercentOfNewProfitAboveHighWaterMark() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        assertEq(vault.highWaterMarkAssets(), 1_000 * USDC);

        aToken.accrueYield(address(strategy), 100 * USDC);
        uint256 treasuryBefore = vault.balanceOf(feeRecipient);
        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();

        assertApproxEqAbs(feeAssets, 10 * USDC, 1);
        assertGt(feeShares, 0);
        assertEq(vault.balanceOf(feeRecipient), treasuryBefore + feeShares);
        assertEq(vault.highWaterMarkAssets(), 1_100 * USDC);
    }

    function test_RepeatedCrystallizationCannotDoubleChargeSameYield() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 100 * USDC);

        (uint256 firstFee,) = vault.crystallizeYieldFee();
        (uint256 secondFee, uint256 secondShares) = vault.crystallizeYieldFee();

        assertApproxEqAbs(firstFee, 10 * USDC, 1);
        assertEq(secondFee, 0);
        assertEq(secondShares, 0);
    }

    function test_NoYieldMeansNoPerformanceFee() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        uint256 treasuryAfterDeposit = vault.balanceOf(feeRecipient);

        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();
        assertEq(feeAssets, 0);
        assertEq(feeShares, 0);
        assertEq(vault.balanceOf(feeRecipient), treasuryAfterDeposit);
    }

    function test_LossAndRecoveryToOldHighWaterMarkAreNotChargedAgain() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 100 * USDC);
        vault.crystallizeYieldFee();
        assertEq(vault.highWaterMarkAssets(), 1_100 * USDC);

        vm.prank(address(pool));
        aToken.burnPosition(address(strategy), 100 * USDC);
        aToken.removeLiquidity(bob, 100 * USDC);

        (uint256 lossFee,) = vault.crystallizeYieldFee();
        assertEq(lossFee, 0);

        aToken.accrueYield(address(strategy), 100 * USDC);
        (uint256 recoveryFee,) = vault.crystallizeYieldFee();
        assertEq(recoveryFee, 0);

        aToken.accrueYield(address(strategy), 40 * USDC);
        (uint256 newProfitFee,) = vault.crystallizeYieldFee();
        assertApproxEqAbs(newProfitFee, 4 * USDC, 1);
    }

    function test_DepositDoesNotCountAsProfit() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        assertEq(vault.highWaterMarkAssets(), 1_000 * USDC);

        vm.prank(bob);
        vault.deposit(500 * USDC, bob);

        assertEq(vault.highWaterMarkAssets(), 1_500 * USDC);
        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();
        assertEq(feeAssets, 0);
        assertEq(feeShares, 0);
    }

    function test_DepositDuringLossPreservesLossHurdle() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);

        vm.prank(address(pool));
        aToken.burnPosition(address(strategy), 100 * USDC);
        aToken.removeLiquidity(bob, 100 * USDC);
        assertEq(vault.totalAssets(), 900 * USDC);

        vm.prank(bob);
        vault.deposit(100 * USDC, bob);
        assertEq(vault.highWaterMarkAssets(), 1_100 * USDC);

        aToken.accrueYield(address(strategy), 100 * USDC);
        assertEq(vault.totalAssets(), 1_100 * USDC);
        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();
        assertEq(feeAssets, 0);
        assertEq(feeShares, 0);
    }

    function test_WithdrawalScalesHighWaterMarkAndDoesNotCreateProfit() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        uint256 hwmBefore = vault.highWaterMarkAssets();

        vm.prank(alice);
        vault.withdraw(100 * USDC, alice, alice);

        assertLt(vault.highWaterMarkAssets(), hwmBefore);
        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();
        assertEq(feeAssets, 0);
        assertEq(feeShares, 0);
    }

    function test_PendingPerformanceFeeIsReflectedInViewsBeforeCrystallization() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 100 * USDC);

        uint256 aliceShares = vault.balanceOf(alice);
        uint256 feeRecipientSharesBefore = vault.balanceOf(feeRecipient);
        uint256 aliceAssetsBefore = vault.previewRedeem(aliceShares);
        uint256 feeRecipientMaxBefore = vault.maxRedeem(feeRecipient);

        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();

        assertApproxEqAbs(feeAssets, 10 * USDC, 1);
        assertGt(feeShares, 0);
        assertEq(vault.balanceOf(feeRecipient), feeRecipientSharesBefore + feeShares);
        assertApproxEqAbs(vault.previewRedeem(aliceShares), aliceAssetsBefore, 1);
        assertApproxEqAbs(vault.maxRedeem(feeRecipient), feeRecipientMaxBefore, 1);
    }

    function test_PreviewDepositIncludesEntryFeeAndMatchesDepositWithPendingYieldFee() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 100 * USDC);

        uint256 grossShares = vault.convertToShares(100 * USDC);
        uint256 expectedUserShares = vault.previewDeposit(100 * USDC);
        assertLt(expectedUserShares, grossShares);

        vm.prank(bob);
        uint256 actualUserShares = vault.deposit(100 * USDC, bob);
        assertEq(actualUserShares, expectedUserShares);
    }

    function test_PendingFeeAwareWithdrawAndRedeemPreviewsMatchOperations() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 100 * USDC);

        uint256 expectedWithdrawShares = vault.previewWithdraw(50 * USDC);
        vm.prank(alice);
        uint256 burned = vault.withdraw(50 * USDC, alice, alice);
        assertEq(burned, expectedWithdrawShares);

        aToken.accrueYield(address(strategy), 20 * USDC);
        uint256 sharesToRedeem = vault.balanceOf(alice) / 10;
        uint256 expectedRedeemAssets = vault.previewRedeem(sharesToRedeem);
        vm.prank(alice);
        uint256 redeemed = vault.redeem(sharesToRedeem, alice, alice);
        assertEq(redeemed, expectedRedeemAssets);
    }

    function test_PausingInflowsDoesNotBlockFeeAwareWithdrawal() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 100 * USDC);
        vm.prank(owner);
        vault.pause();

        vm.prank(alice);
        vault.withdraw(100 * USDC, alice, alice);
        assertGt(vault.balanceOf(feeRecipient), 0);

        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(1 * USDC, bob);
    }

    function test_FailedDepositRollsBackPendingFeeCrystallizationAndHwmChange() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 100 * USDC);

        uint256 treasuryBefore = vault.balanceOf(feeRecipient);
        uint256 hwmBefore = vault.highWaterMarkAssets();
        pool.setFailSupply(true);

        vm.prank(bob);
        vm.expectRevert(bytes("SUPPLY_FAILED"));
        vault.deposit(100 * USDC, bob);

        assertEq(vault.balanceOf(feeRecipient), treasuryBefore);
        assertEq(vault.highWaterMarkAssets(), hwmBefore);
        assertEq(vault.totalAssets(), 1_100 * USDC);
    }

    function test_EmptyVaultCanResetHwmAfterAllOwnersRedeem() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);

        aToken.accrueYield(address(strategy), 100 * USDC);

        vault.crystallizeYieldFee();

        uint256 aliceShares = vault.balanceOf(alice);

        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);

        uint256 feeRecipientShares = vault.balanceOf(feeRecipient);

        vm.prank(feeRecipient);
        vault.redeem(feeRecipientShares, feeRecipient, feeRecipient);

        assertEq(vault.totalSupply(), 0);

        assertEq(vault.highWaterMarkAssets(), 0);

        vm.prank(bob);
        vault.deposit(1_000 * USDC, bob);

        assertEq(vault.highWaterMarkAssets(), vault.totalAssets());

        assertApproxEqAbs(vault.totalAssets(), 1_000 * USDC, 1);

        (uint256 feeAssets,) = vault.crystallizeYieldFee();

        assertEq(feeAssets, 0);
    }

    function test_NoCallerCanMintArbitraryFeeOrMoveStrategyPrincipal() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);

        vm.prank(owner);
        (bool minted,) = address(vault).call(abi.encodeWithSignature("mintFee(uint256)", 1_000 * USDC));
        assertFalse(minted);

        vm.prank(feeRecipient);
        (bool withdrew,) = address(strategy).call(abi.encodeWithSignature("withdraw(uint256)", 1_000 * USDC));
        assertFalse(withdrew);
        assertEq(vault.totalAssets(), 1_000 * USDC);
    }

    function testFuzz_PerformanceFeeNeverExceedsTenPercentOfNewProfit(uint96 rawDeposit, uint96 rawYield) public {
        uint256 depositAmount = bound(uint256(rawDeposit), 1 * USDC, 5_000 * USDC);
        uint256 yieldAmount = bound(uint256(rawYield), 1, depositAmount / 2);
        token.mint(alice, depositAmount);

        vm.prank(alice);
        vault.deposit(depositAmount, alice);
        aToken.accrueYield(address(strategy), yieldAmount);

        (uint256 feeAssets,) = vault.crystallizeYieldFee();
        uint256 ceiling = yieldAmount * vault.PROFIT_FEE_BPS() / vault.BPS_DENOMINATOR();
        assertLe(feeAssets, ceiling);
        assertApproxEqAbs(feeAssets, ceiling, 1);
    }
}
