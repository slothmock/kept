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
    address public immutable override asset;

    constructor(address asset_) {
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
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new MockUSDC();
        aToken = new MockAToken(address(token));
        pool = new MockAavePool(token, aToken);
        vault = new KeptSavingsVault(IERC20(address(token)), owner, owner, 100, 2_500);
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

    function test_FirstDepositSuppliesExactlyAndUsesSixDecimals() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(100 * USDC, alice);
        assertEq(shares, 100 * USDC * 1e6);
        assertEq(vault.decimals(), 12);
        assertEq(vault.balanceOf(alice), shares);
        assertEq(aToken.balanceOf(address(strategy)), 100 * USDC);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_MultipleUsersRemainProportionateAfterYield() public {
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        aToken.accrueYield(address(strategy), 20 * USDC);
        vm.prank(bob);
        vault.deposit(120 * USDC, bob);
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(bob)), 120 * USDC, 1);
        assertEq(vault.totalAssets(), 240 * USDC);
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(alice)), 120 * USDC, 1);
    }

    function test_MintWithdrawAndRedeemRetainERC4626Semantics() public {
        vm.prank(alice);
        uint256 assets = vault.mint(200 * USDC * 1e6, alice);
        assertEq(assets, 200 * USDC);
        vm.prank(alice);
        uint256 burned = vault.withdraw(50 * USDC, alice, alice);
        assertEq(burned, 50 * USDC * 1e6);
        uint256 remainingShares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 redeemed = vault.redeem(remainingShares, alice, alice);
        assertEq(redeemed, 150 * USDC);
        assertEq(token.balanceOf(alice), 10_000 * USDC);
    }

    function test_IdleVaultDonationIsIncludedInTotalAssets() public {
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        token.mint(address(vault), 7 * USDC);
        assertEq(vault.totalAssets(), 107 * USDC);
    }

    function test_DonationCannotExtractVictimDepositProfit() public {
        address attacker = alice;
        address victim = bob;
        vm.prank(attacker);
        vault.deposit(1, attacker);
        vm.prank(attacker);
        token.transfer(address(vault), 1_000 * USDC);
        uint256 beforeVictim = token.balanceOf(victim);
        vm.prank(victim);
        vault.deposit(1_000 * USDC, victim);
        uint256 attackerShares = vault.balanceOf(attacker);
        vm.prank(attacker);
        uint256 out = vault.redeem(attackerShares, attacker, attacker);
        assertLt(out, 1_000 * USDC);
        assertLt(token.balanceOf(attacker), 10_000 * USDC);
        assertEq(token.balanceOf(victim), beforeVictim - 1_000 * USDC);
    }

    function test_MultiVictimDonationCannotMintZeroSharesOrProfit() public {
        address attacker = alice;
        address victimOne = bob;
        address victimTwo = makeAddr("victimTwo");
        address victimThree = makeAddr("victimThree");
        token.mint(victimTwo, 50 * USDC);
        token.mint(victimThree, 50 * USDC);
        vm.prank(victimTwo);
        token.approve(address(vault), type(uint256).max);
        vm.prank(victimThree);
        token.approve(address(vault), type(uint256).max);

        uint256 attackerBefore = token.balanceOf(attacker);
        vm.prank(attacker);
        vault.deposit(1, attacker);
        vm.prank(attacker);
        token.transfer(address(vault), 100 * USDC);

        vm.prank(victimOne);
        uint256 victimOneShares = vault.deposit(50 * USDC, victimOne);
        vm.prank(victimTwo);
        uint256 victimTwoShares = vault.deposit(50 * USDC, victimTwo);
        vm.prank(victimThree);
        uint256 victimThreeShares = vault.deposit(50 * USDC, victimThree);

        assertGt(victimOneShares, 0);
        assertGt(victimTwoShares, 0);
        assertGt(victimThreeShares, 0);
        assertGt(vault.convertToAssets(victimOneShares), 0);
        assertGt(vault.convertToAssets(victimTwoShares), 0);
        assertGt(vault.convertToAssets(victimThreeShares), 0);

        uint256 attackerShares = vault.balanceOf(attacker);
        vm.prank(attacker);
        vault.redeem(attackerShares, attacker, attacker);
        assertLe(token.balanceOf(attacker), attackerBefore);
    }

    function test_DepositRejectsBeforeStrategyBinding() public {
        KeptSavingsVault unbound = new KeptSavingsVault(IERC20(address(token)), owner, owner, 100, 2_500);
        vm.prank(alice);
        token.approve(address(unbound), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(KeptSavingsVault.StrategyNotBound.selector);
        unbound.deposit(1, alice);
        vm.prank(alice);
        vm.expectRevert(KeptSavingsVault.StrategyNotBound.selector);
        unbound.mint(1, alice);
    }

    function test_StrategyBindingIsOwnerOnlyOneTimeAndMatchingAsset() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.bindStrategy(address(strategy));
        vm.prank(owner);
        vm.expectRevert(KeptSavingsVault.StrategyAlreadyBound.selector);
        vault.bindStrategy(address(strategy));

        KeptSavingsVault otherVault = new KeptSavingsVault(IERC20(address(token)), owner, owner, 100, 2_500);
        MockUSDC other = new MockUSDC();
        WrongAssetStrategy wrong = new WrongAssetStrategy(address(other));
        vm.prank(owner);
        vm.expectRevert(KeptSavingsVault.StrategyAssetMismatch.selector);
        otherVault.bindStrategy(address(wrong));
    }

    function test_StrategyConstructedForAnotherVaultCannotBeBound() public {
        KeptSavingsVault intendedVault = new KeptSavingsVault(IERC20(address(token)), owner, owner, 100, 2_500);
        KeptSavingsVault wrongVault = new KeptSavingsVault(IERC20(address(token)), owner, owner, 100, 2_500);
        AaveUSDCStrategy wrongVaultStrategy =
            new AaveUSDCStrategy(address(wrongVault), address(token), address(pool), address(aToken));

        vm.prank(owner);
        vm.expectRevert(KeptSavingsVault.StrategyVaultMismatch.selector);
        intendedVault.bindStrategy(address(wrongVaultStrategy));
    }

    function test_ConstructorValidationRejectsInvalidComponents() public {
        vm.expectRevert(KeptSavingsVault.InvalidAsset.selector);
        new KeptSavingsVault(IERC20(address(0)), owner, owner, 100, 2_500);

        vm.expectRevert(AaveUSDCStrategy.InvalidAsset.selector);
        new AaveUSDCStrategy(address(vault), address(0), address(pool), address(aToken));
        vm.expectRevert(AaveUSDCStrategy.InvalidAavePool.selector);
        new AaveUSDCStrategy(address(vault), address(token), address(0), address(aToken));
        vm.expectRevert(AaveUSDCStrategy.InvalidAToken.selector);
        new AaveUSDCStrategy(address(vault), address(token), address(pool), address(0));

        MockUSDC other = new MockUSDC();
        MockAToken wrongAToken = new MockAToken(address(other));
        vm.expectRevert(AaveUSDCStrategy.ATokenAssetMismatch.selector);
        new AaveUSDCStrategy(address(vault), address(token), address(pool), address(wrongAToken));
    }

    function test_VaultAndStrategyRejectNonSixDecimalAssets() public {
        MockWrongDecimalsToken wrongDecimals = new MockWrongDecimalsToken();
        MockAToken wrongDecimalsAToken = new MockAToken(address(wrongDecimals));

        vm.expectRevert(KeptSavingsVault.InvalidAsset.selector);
        new KeptSavingsVault(IERC20(address(wrongDecimals)), owner, owner, 100, 2_500);

        vm.expectRevert(AaveUSDCStrategy.InvalidAsset.selector);
        new AaveUSDCStrategy(address(vault), address(wrongDecimals), address(pool), address(wrongDecimalsAToken));
    }

    function test_PauseBlocksInflowsButNeverWithdrawOrRedeem() public {
        vm.prank(alice);
        vault.deposit(100 * USDC, alice);
        vm.prank(owner);
        vault.pause();
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(1, bob);
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.mint(1, bob);

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

    function test_StrategyUsesOnlyPoolAllowanceAndReflectsYield() public {
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
        assertEq(vault.maxWithdraw(alice), 40 * USDC);
        uint256 maximumRedeemableShares = vault.maxRedeem(alice);
        assertLe(vault.previewRedeem(maximumRedeemableShares), 40 * USDC);
        assertGt(vault.previewRedeem(maximumRedeemableShares + 1), 40 * USDC);
        assertLt(maximumRedeemableShares, vault.balanceOf(alice));
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

    function test_OwnerHasNoSaverFundSeizureFunction() public {
        vm.prank(alice);
        vault.deposit(10 * USDC, alice);
        vm.prank(owner);
        (bool ok,) = address(vault)
            .call(abi.encodeWithSignature("rescueTokens(address,address,uint256)", address(token), owner, 10 * USDC));
        assertFalse(ok);
        assertEq(vault.convertToAssets(vault.balanceOf(alice)), 10 * USDC);
    }

    function testFuzz_DepositThenRedeemPreservesAssets(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000 * USDC);
        vm.prank(alice);
        uint256 shares = vault.deposit(amount, alice);
        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);
        assertEq(assets, amount);
    }

    function testFuzz_DonationCannotCreateMultiVictimProfit(uint64 rawDonation, uint64 rawVictimDeposit) public {
        uint256 donation = bound(uint256(rawDonation), 1, 1_000 * USDC);
        uint256 victimDeposit = bound(uint256(rawVictimDeposit), 1, 1_000 * USDC);
        address victimTwo = makeAddr("fuzzVictimTwo");
        address victimThree = makeAddr("fuzzVictimThree");
        token.mint(victimTwo, victimDeposit);
        token.mint(victimThree, victimDeposit);
        vm.prank(victimTwo);
        token.approve(address(vault), type(uint256).max);
        vm.prank(victimThree);
        token.approve(address(vault), type(uint256).max);

        uint256 attackerBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.deposit(1, alice);
        vm.prank(alice);
        token.transfer(address(vault), donation);

        address[3] memory victims = [bob, victimTwo, victimThree];
        for (uint256 i; i < victims.length; ++i) {
            uint256 expectedShares = vault.previewDeposit(victimDeposit);
            if (expectedShares == 0) {
                vm.prank(victims[i]);
                vm.expectRevert(KeptSavingsVault.ZeroShares.selector);
                vault.deposit(victimDeposit, victims[i]);
            } else {
                vm.prank(victims[i]);
                uint256 shares = vault.deposit(victimDeposit, victims[i]);
                assertGt(shares, 0);
            }
        }

        uint256 attackerShares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(attackerShares, alice, alice);
        assertLe(token.balanceOf(alice), attackerBefore);
    }

    function testFuzz_DonationBeforeFirstDepositCannotCreateDepositorProfit(uint64 rawDonation, uint64 rawVictimDeposit)
        public
    {
        uint256 donation = bound(uint256(rawDonation), 1, 1_000 * USDC);
        uint256 victimDeposit = bound(uint256(rawVictimDeposit), 1, 1_000 * USDC);
        uint256 attackerBefore = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(address(vault), donation);

        if (vault.previewDeposit(1) == 0) {
            vm.prank(alice);
            vm.expectRevert(KeptSavingsVault.ZeroShares.selector);
            vault.deposit(1, alice);
        } else {
            vm.prank(alice);
            vault.deposit(1, alice);
            vm.prank(bob);
            vault.deposit(victimDeposit, bob);
            uint256 attackerShares = vault.balanceOf(alice);
            vm.prank(alice);
            vault.redeem(attackerShares, alice, alice);
        }

        assertLe(token.balanceOf(alice), attackerBefore);
    }
}
