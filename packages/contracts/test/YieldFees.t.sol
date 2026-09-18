// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {MockUSDC, MockAToken, MockAavePool} from "./mocks/MockAave.sol";

contract YieldFeesTest is Test {
    uint256 internal constant USDC = 1e6;
    uint16 internal constant STANDARD_ANNUAL_FEE_BPS = 100;
    uint16 internal constant STANDARD_PROFIT_FEE_BPS = 2_500;

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
        vault = new KeptSavingsVault(
            IERC20(address(token)), owner, feeRecipient, STANDARD_ANNUAL_FEE_BPS, STANDARD_PROFIT_FEE_BPS
        );
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

    function test_StandardFeeRetainsOnePointFromFourPointFivePercentAnnualYield() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);

        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);

        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();

        assertGt(feeShares, 0);
        assertEq(feeAssets, vault.previewRedeem(vault.balanceOf(feeRecipient)));
        assertApproxEqAbs(feeAssets, 10 * USDC, 1);
        assertApproxEqAbs(vault.previewRedeem(vault.balanceOf(alice)), 1_035 * USDC, 1);
    }

    function test_NewDepositDoesNotInheritPriorAnnualFeeCapacity() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 45 * USDC);
        vm.prank(bob);
        vault.deposit(1_000 * USDC, bob);

        (uint256 feeAssets,) = vault.crystallizeYieldFee();

        assertEq(feeAssets, 0);

        vm.warp(block.timestamp + 365 days);
        (feeAssets,) = vault.crystallizeYieldFee();
        assertEq(feeAssets, 0);

        aToken.accrueYield(address(strategy), 45 * USDC);
        (feeAssets,) = vault.crystallizeYieldFee();
        assertApproxEqAbs(feeAssets, (45 * USDC) / 4, 1);
    }

    function test_WithdrawalRemovesDepartingSharesFeeCapacity() public {
        vm.prank(alice);
        vault.deposit(500 * USDC, alice);
        vm.prank(bob);
        vault.deposit(500 * USDC, bob);
        vm.warp(block.timestamp + 365 days);

        uint256 aliceShares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);
        aToken.accrueYield(address(strategy), 40 * USDC);

        (uint256 feeAssets,) = vault.crystallizeYieldFee();

        assertApproxEqAbs(feeAssets, 5 * USDC, 1);
    }

    function test_RepeatedCrystallizationWithoutNewYieldIsIdempotent() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);
        vault.crystallizeYieldFee();
        uint256 feeShares = vault.balanceOf(feeRecipient);
        uint256 highWaterMarkAssets = vault.highWaterMarkAssets();

        (uint256 secondFeeAssets, uint256 secondFeeShares) = vault.crystallizeYieldFee();

        assertEq(secondFeeAssets, 0);
        assertEq(secondFeeShares, 0);
        assertEq(vault.balanceOf(feeRecipient), feeShares);
        assertEq(vault.highWaterMarkAssets(), highWaterMarkAssets);
    }

    function test_ProfitPercentageCapProtectsUsersWhenGrossYieldIsLow() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);

        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 30 * USDC);

        (uint256 feeAssets,) = vault.crystallizeYieldFee();

        assertApproxEqAbs(feeAssets, 7_500_000, 1);
        assertLe(vault.previewRedeem(vault.balanceOf(feeRecipient)), feeAssets);
        assertApproxEqAbs(vault.previewRedeem(vault.balanceOf(alice)), 1_022_500_000, 2);
    }

    function test_LossAndRecoveryToHighWaterMarkCreateNoFee() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);

        vm.prank(address(pool));
        aToken.burnPosition(address(strategy), 100 * USDC);
        aToken.removeLiquidity(bob, 100 * USDC);
        (uint256 lossFee,) = vault.crystallizeYieldFee();
        assertEq(lossFee, 0);

        aToken.accrueYield(address(strategy), 100 * USDC);
        (uint256 recoveryFee,) = vault.crystallizeYieldFee();
        assertEq(recoveryFee, 0);
        assertEq(vault.balanceOf(feeRecipient), 0);

        aToken.accrueYield(address(strategy), 40 * USDC);
        (uint256 newProfitFee,) = vault.crystallizeYieldFee();
        assertApproxEqAbs(newProfitFee, 9 * USDC, 1);
    }

    function test_AnnualCapUsesLowerObservedEndpointAfterLoss() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        aToken.accrueYield(address(strategy), 500 * USDC);
        vault.crystallizeYieldFee();
        vm.warp(block.timestamp + 365 days);
        vm.prank(address(pool));
        aToken.burnPosition(address(strategy), 300 * USDC);
        aToken.removeLiquidity(bob, 300 * USDC);

        (uint256 feeAssets,) = vault.crystallizeYieldFee();

        assertApproxEqAbs(feeAssets, 12 * USDC, 1);
    }

    function test_DepositDuringLossDoesNotEraseExistingLossHurdle() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.prank(address(pool));
        aToken.burnPosition(address(strategy), 100 * USDC);
        aToken.removeLiquidity(bob, 100 * USDC);

        vm.prank(bob);
        vault.deposit(100 * USDC, bob);
        aToken.accrueYield(address(strategy), 100 * USDC);
        vm.warp(block.timestamp + 365 days);

        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();
        assertEq(feeAssets, 0);
        assertEq(feeShares, 0);
        assertEq(vault.highWaterMarkAssets(), 1_100 * USDC);
    }

    function test_CapitalFlowsWithoutYieldDoNotCreateFeeShares() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 90 days);
        vm.prank(bob);
        vault.mint(100 * USDC * 1e6, bob);
        vm.warp(block.timestamp + 90 days);
        vm.prank(alice);
        vault.withdraw(100 * USDC, alice, alice);
        vm.warp(block.timestamp + 90 days);
        uint256 bobSharesToRedeem = vault.balanceOf(bob) / 2;
        vm.prank(bob);
        vault.redeem(bobSharesToRedeem, bob, bob);

        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();
        assertEq(feeAssets, 0);
        assertEq(feeShares, 0);
        assertEq(vault.balanceOf(feeRecipient), 0);
    }

    function test_FailedDepositDoesNotCrystallizeOrAdvanceFeeAccounting() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);
        uint256 checkpointBefore = vault.lastFeeCheckpointAt();
        uint256 highWaterBefore = vault.highWaterMarkAssets();
        pool.setFailSupply(true);

        vm.prank(bob);
        vm.expectRevert(bytes("SUPPLY_FAILED"));
        vault.deposit(100 * USDC, bob);

        assertEq(vault.balanceOf(feeRecipient), 0);
        assertEq(vault.lastFeeCheckpointAt(), checkpointBefore);
        assertEq(vault.highWaterMarkAssets(), highWaterBefore);
        assertEq(vault.totalAssets(), 1_045 * USDC);
    }

    function test_DepositToleratesOneUnitAaveSupplyRoundingWithoutMisclassifyingPrincipal() public {
        pool.setSupplyCreditShortfall(1);

        vm.prank(alice);
        vault.deposit(10 * USDC, alice);

        assertEq(vault.totalAssets(), 10 * USDC - 1);
        assertEq(vault.highWaterMarkAssets(), 10 * USDC - 1);
        assertEq(vault.balanceOf(feeRecipient), 0);
    }

    function test_PausingInflowsDoesNotBlockFeeAwareWithdrawal() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);
        vm.prank(owner);
        vault.pause();

        vm.prank(alice);
        vault.withdraw(100 * USDC, alice, alice);

        assertEq(token.balanceOf(alice), 9_100 * USDC);
        assertGt(vault.balanceOf(feeRecipient), 0);
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(1 * USDC, bob);
    }

    function test_EmptyVaultResetsFeeLiabilityForNextDepositor() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);
        vault.crystallizeYieldFee();

        uint256 aliceShares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);
        uint256 feeShares = vault.balanceOf(feeRecipient);
        vm.prank(feeRecipient);
        vault.redeem(feeShares, feeRecipient, feeRecipient);

        assertEq(vault.totalSupply(), 0);
        assertEq(vault.feeCheckpointAssets(), 0);
        assertEq(vault.highWaterMarkAssets(), 0);

        vm.warp(block.timestamp + 2 * 365 days);
        vm.prank(bob);
        vault.deposit(1_000 * USDC, bob);
        (uint256 feeAssetsAfterReset,) = vault.crystallizeYieldFee();
        assertEq(feeAssetsAfterReset, 0);
        assertEq(vault.balanceOf(feeRecipient), 0);
    }

    function test_ConstructorRejectsInvalidOrExcessiveFeeAuthority() public {
        vm.expectRevert(KeptSavingsVault.InvalidFeeConfiguration.selector);
        new KeptSavingsVault(IERC20(address(token)), owner, address(0), 100, 2_500);
        vm.expectRevert(KeptSavingsVault.InvalidFeeConfiguration.selector);
        new KeptSavingsVault(IERC20(address(token)), owner, feeRecipient, 101, 2_500);
        vm.expectRevert(KeptSavingsVault.InvalidFeeConfiguration.selector);
        new KeptSavingsVault(IERC20(address(token)), owner, feeRecipient, 100, 2_501);
    }

    function test_PreviewsMatchOperationsWhenFeeIsPending() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);

        uint256 expectedDepositShares = vault.previewDeposit(100 * USDC);
        assertEq(vault.convertToShares(100 * USDC), expectedDepositShares);
        assertEq(vault.convertToAssets(vault.balanceOf(alice)), vault.previewRedeem(vault.balanceOf(alice)));
        vm.prank(bob);
        uint256 depositShares = vault.deposit(100 * USDC, bob);
        assertEq(depositShares, expectedDepositShares);

        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);
        uint256 sharesToMint = 10 * 1e12;
        uint256 expectedMintAssets = vault.previewMint(sharesToMint);
        vm.prank(bob);
        uint256 mintAssets = vault.mint(sharesToMint, bob);
        assertEq(mintAssets, expectedMintAssets);

        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);
        uint256 expectedWithdrawShares = vault.previewWithdraw(50 * USDC);
        uint256 aliceSharesBefore = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 withdrawShares = vault.withdraw(50 * USDC, alice, alice);
        assertEq(withdrawShares, expectedWithdrawShares);
        assertEq(aliceSharesBefore - vault.balanceOf(alice), expectedWithdrawShares);

        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);
        uint256 sharesToRedeem = vault.balanceOf(alice) / 10;
        uint256 expectedRedeemAssets = vault.previewRedeem(sharesToRedeem);
        vm.prank(alice);
        uint256 redeemAssets = vault.redeem(sharesToRedeem, alice, alice);
        assertEq(redeemAssets, expectedRedeemAssets);
    }

    function test_ShareTransferDoesNotCreateYieldOrFeeCapacity() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        uint256 transferredShares = vault.balanceOf(alice) / 2;

        vm.prank(alice);
        vault.transfer(bob, transferredShares);

        assertEq(vault.balanceOf(bob), transferredShares);
        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();
        assertEq(feeAssets, 0);
        assertEq(feeShares, 0);
    }

    function test_MaxWithdrawRemainsExecutableWhenFeeIsPending() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);

        uint256 maximumAssets = vault.maxWithdraw(alice);
        uint256 sharesBefore = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 burnedShares = vault.withdraw(maximumAssets, alice, alice);

        assertLe(burnedShares, sharesBefore);
        assertEq(vault.balanceOf(alice), sharesBefore - burnedShares);
    }

    function test_MaxRedeemRemainsExecutableWhenFeeIsPending() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);

        uint256 maximumShares = vault.maxRedeem(alice);
        uint256 expectedAssets = vault.previewRedeem(maximumShares);
        vm.prank(alice);
        uint256 redeemedAssets = vault.redeem(maximumShares, alice, alice);

        assertEq(maximumShares, 1_000 * USDC * 1e6);
        assertEq(redeemedAssets, expectedAssets);
    }

    function test_FeeRecipientMaxViewsIncludeSharesFromPendingCrystallization() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);
        vm.warp(block.timestamp + 365 days);
        aToken.accrueYield(address(strategy), 45 * USDC);

        uint256 maximumShares = vault.maxRedeem(feeRecipient);
        uint256 maximumAssets = vault.maxWithdraw(feeRecipient);

        assertGt(maximumShares, 0);
        assertGt(maximumAssets, 0);
        vm.prank(feeRecipient);
        uint256 redeemedAssets = vault.redeem(maximumShares, feeRecipient, feeRecipient);
        assertEq(redeemedAssets, maximumAssets);
    }

    function test_NoCallerCanMintAnArbitraryFeeOrMoveStrategyPrincipal() public {
        vm.prank(alice);
        vault.deposit(1_000 * USDC, alice);

        vm.prank(owner);
        (bool minted,) = address(vault).call(abi.encodeWithSignature("mintFee(uint256)", 1_000 * USDC));
        assertFalse(minted);

        vm.prank(feeRecipient);
        (bool withdrew,) = address(strategy).call(abi.encodeWithSignature("withdraw(uint256)", 1_000 * USDC));
        assertFalse(withdrew);
        assertEq(vault.balanceOf(feeRecipient), 0);
        assertEq(vault.totalAssets(), 1_000 * USDC);
    }

    function testFuzz_FeeNeverExceedsEitherEconomicCeiling(uint96 rawDeposit, uint96 rawYield, uint32 rawElapsed)
        public
    {
        uint256 depositAmount = bound(uint256(rawDeposit), 1 * USDC, 5_000 * USDC);
        uint256 yieldAmount = bound(uint256(rawYield), 1, depositAmount / 2);
        uint256 elapsed = bound(uint256(rawElapsed), 1 days, 730 days);
        token.mint(alice, depositAmount);
        vm.prank(alice);
        vault.deposit(depositAmount, alice);
        vm.warp(block.timestamp + elapsed);
        aToken.accrueYield(address(strategy), yieldAmount);

        (uint256 feeAssets,) = vault.crystallizeYieldFee();
        uint256 profitCeiling = yieldAmount * STANDARD_PROFIT_FEE_BPS / 10_000;
        uint256 annualCeiling = depositAmount * STANDARD_ANNUAL_FEE_BPS * elapsed / (10_000 * 365 days);

        assertLe(feeAssets, profitCeiling);
        assertLe(feeAssets, annualCeiling);
        assertLe(vault.previewRedeem(vault.balanceOf(feeRecipient)), feeAssets);
    }
}
