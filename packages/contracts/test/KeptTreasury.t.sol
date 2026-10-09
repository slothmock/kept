// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {KeptTreasury} from "../src/KeptTreasury.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";

import {
    MockUSDC,
    MockAToken,
    MockAavePool
} from "./mocks/MockAave.sol";

contract KeptTreasuryTest is Test {
    uint256 internal constant USDC = 1e6;

    MockUSDC internal token;
    MockAToken internal aToken;
    MockAavePool internal pool;

    KeptSavingsVault internal vault;
    KeptTreasury internal treasury;
    AaveUSDCStrategy internal strategy;

    address internal owner =
        makeAddr("owner");

    address internal rewardManager =
        makeAddr("rewardManager");

    address internal alice =
        makeAddr("alice");

    address internal bob =
        makeAddr("bob");

    function setUp() public {
        token = new MockUSDC();

        aToken = new MockAToken(
            address(token)
        );

        pool = new MockAavePool(
            token,
            aToken
        );

        treasury = new KeptTreasury(
            IERC20(address(token)),
            owner
        );

        vault = new KeptSavingsVault(
            IERC20(address(token)),
            owner,
            address(treasury)
        );

        strategy = new AaveUSDCStrategy(
            address(vault),
            address(token),
            address(pool),
            address(aToken)
        );

        vm.prank(owner);
        treasury.bindVault(
            address(vault)
        );

        vm.prank(owner);
        treasury.setRewardManager(
            rewardManager
        );

        vm.prank(owner);
        vault.bindStrategy(
            address(strategy)
        );

        token.mint(
            alice,
            10_000 * USDC
        );

        vm.prank(alice);
        assertTrue(
            token.approve(
                address(vault),
                type(uint256).max
            )
        );
    }

    function test_VaultIsBoundCorrectly()
        public
        view
    {
        assertEq(
            address(treasury.vault()),
            address(vault)
        );
    }

    function test_DepositFeeSharesGoToTreasury()
        public
    {
        vm.prank(alice);
        vault.deposit(
            1_000 * USDC,
            alice
        );

        assertGt(
            vault.balanceOf(
                address(treasury)
            ),
            0
        );
    }

    function test_TreasuryCanRedeemOwnRevenue()
        public
    {
        vm.prank(alice);
        vault.deposit(
            5_000 * USDC,
            alice
        );

        uint256 available =
            vault.maxWithdraw(
                address(treasury)
            );

        assertGt(
            available,
            0
        );

        // Fees are charged on net savings. A 5,000 USDC gross
        // deposit therefore generates slightly less than 10 USDC.
        uint256 amount =
            5 * USDC;

        assertGe(
            available,
            amount
        );

        vm.prank(owner);
        treasury.redeemRevenue(
            amount
        );

        assertEq(
            token.balanceOf(
                address(treasury)
            ),
            amount
        );
    }

    function test_RedeemingTreasuryRevenueDoesNotBurnAliceShares()
        public
    {
        vm.prank(alice);
        vault.deposit(
            5_000 * USDC,
            alice
        );

        uint256 aliceBefore =
            vault.balanceOf(alice);

        vm.prank(owner);
        treasury.redeemRevenue(
            5 * USDC
        );

        assertEq(
            vault.balanceOf(alice),
            aliceBefore
        );
    }

    function test_RewardManagerCanPayReward()
        public
    {
        vm.prank(alice);
        vault.deposit(
            5_000 * USDC,
            alice
        );

        bytes32 rewardId =
            keccak256(
                "alice-week-one"
            );

        vm.prank(rewardManager);
        treasury.payReward(
            rewardId,
            bob,
            5 * USDC
        );

        assertEq(
            token.balanceOf(bob),
            5 * USDC
        );

        assertTrue(
            treasury.rewardUsed(
                rewardId
            )
        );
    }

    function test_DuplicateRewardIdFails()
        public
    {
        vm.prank(alice);
        vault.deposit(
            5_000 * USDC,
            alice
        );

        bytes32 rewardId =
            keccak256(
                "duplicate"
            );

        vm.prank(rewardManager);
        treasury.payReward(
            rewardId,
            bob,
            1 * USDC
        );

        vm.prank(rewardManager);

        vm.expectRevert(
            abi.encodeWithSelector(
                KeptTreasury
                    .RewardAlreadyUsed
                    .selector,
                rewardId
            )
        );

        treasury.payReward(
            rewardId,
            bob,
            1 * USDC
        );
    }

    function test_UnauthorizedCallerCannotPayReward()
        public
    {
        vm.prank(alice);

        vm.expectRevert(
            abi.encodeWithSelector(
                KeptTreasury
                    .UnauthorizedRewardManager
                    .selector,
                alice
            )
        );

        treasury.payReward(
            keccak256("unauthorized"),
            bob,
            1 * USDC
        );
    }

    function test_RewardCannotExceedMaximum()
        public
    {
        vm.prank(rewardManager);

        vm.expectRevert(
            abi.encodeWithSelector(
                KeptTreasury
                    .RewardTooLarge
                    .selector,
                11 * USDC,
                10 * USDC
            )
        );

        treasury.payReward(
            keccak256("too-large"),
            bob,
            11 * USDC
        );
    }

    function test_RewardCannotExceedTreasuryValue()
        public
    {
        vm.prank(alice);
        vault.deposit(
            100 * USDC,
            alice
        );

        vm.prank(rewardManager);

        vm.expectRevert();

        treasury.payReward(
            keccak256("underfunded"),
            bob,
            10 * USDC
        );
    }

    function test_PerformanceFeesAccumulateToTreasury()
        public
    {
        vm.prank(alice);
        vault.deposit(
            1_000 * USDC,
            alice
        );

        uint256 sharesBefore =
            vault.balanceOf(
                address(treasury)
            );

        aToken.accrueYield(
            address(strategy),
            100 * USDC
        );

        vault.crystallizeYieldFee();

        uint256 sharesAfter =
            vault.balanceOf(
                address(treasury)
            );

        assertGt(
            sharesAfter,
            sharesBefore
        );
    }

    function test_PauseBlocksRewards()
        public
    {
        vm.prank(owner);
        treasury.pauseRewards();

        vm.prank(rewardManager);
        vm.expectRevert();

        treasury.payReward(
            keccak256("paused"),
            bob,
            1 * USDC
        );
    }

    function test_CannotBindWrongFeeRecipientVault()
        public
    {
        KeptTreasury secondTreasury =
            new KeptTreasury(
                IERC20(address(token)),
                owner
            );

        vm.prank(owner);

        vm.expectRevert(
            KeptTreasury
                .VaultFeeRecipientMismatch
                .selector
        );

        secondTreasury.bindVault(
            address(vault)
        );
    }
}