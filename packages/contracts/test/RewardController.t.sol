// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {RewardController} from "../src/RewardController.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {MockUSDC, MockWrongDecimalsToken, MockAToken, MockAavePool} from "./mocks/MockAave.sol";

contract RewardControllerTest is Test {
    uint256 internal constant USDC = 1e6;
    MockUSDC internal token;
    RewardController internal controller;
    address internal admin = makeAddr("admin");
    address internal qualifier = makeAddr("qualifier");
    address internal manager = makeAddr("manager");
    address internal pauser = makeAddr("pauser");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new MockUSDC();
        controller = new RewardController(IERC20(address(token)), admin, qualifier, manager, pauser);
        token.mint(address(this), 100 * USDC);
        token.approve(address(controller), type(uint256).max);
    }

    function _fundAndOpenDemo() internal returns (uint64 epochId) {
        controller.fundRewards(25 * USDC);
        vm.prank(manager);
        epochId = controller.openEpoch(384, 500 * USDC, 250_000, 750_000, 6_250_000);
    }

    function _register(bytes32 id, address recipient, uint64 epochId) internal returns (uint256) {
        vm.prank(qualifier);
        return controller.registerQualification(id, recipient, epochId, 500 * USDC, 10_000, 10_000);
    }

    function test_ConstantsAndRolesAreFrozen() public view {
        assertEq(controller.RATE_DENOMINATOR(), 1_000_000);
        assertEq(controller.BPS_DENOMINATOR(), 10_000);
        assertEq(controller.EPOCH_DURATION(), 604_800);
        assertEq(controller.MAX_ELIGIBLE_BALANCE(), 1_000 * USDC);
        assertEq(controller.MAX_PERIOD_RATE_PPM(), 1_000);
        assertEq(controller.MAX_CONFIDENCE_BPS(), 10_000);
        assertEq(controller.MAX_REWARD_WEIGHT_BPS(), 10_000);
        assertEq(controller.MAX_REWARD_PER_QUALIFICATION(), 500_000);
        assertEq(controller.MAX_REWARD_PER_USER_PER_EPOCH(), 1_000_000);
        assertEq(controller.MAX_TOTAL_REWARDS_PER_EPOCH(), 10_000_000);
        assertTrue(controller.hasRole(controller.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(controller.hasRole(controller.QUALIFIER_ROLE(), qualifier));
        assertTrue(controller.hasRole(controller.EPOCH_MANAGER_ROLE(), manager));
        assertTrue(controller.hasRole(controller.PAUSER_ROLE(), pauser));
        assertFalse(controller.hasRole(controller.QUALIFIER_ROLE(), admin));
    }

    function test_RolesCannotExerciseEachOthersAuthority() public {
        controller.fundRewards(10 * USDC);

        vm.prank(qualifier);
        vm.expectRevert();
        controller.openEpoch(384, 500 * USDC, 250_000, 750_000, 6_250_000);
        vm.prank(manager);
        vm.expectRevert();
        controller.pause();
        vm.prank(pauser);
        vm.expectRevert();
        controller.openEpoch(384, 500 * USDC, 250_000, 750_000, 6_250_000);

        vm.prank(manager);
        uint64 epochId = controller.openEpoch(384, 500 * USDC, 250_000, 750_000, 6_250_000);
        vm.prank(pauser);
        vm.expectRevert();
        controller.registerQualification(keccak256("wrong-role"), alice, epochId, 500 * USDC, 10_000, 10_000);
    }

    function test_PublicFundingAndDirectFundingAreCompatible() public {
        address funder = makeAddr("funder");
        token.mint(funder, 2 * USDC);
        vm.startPrank(funder);
        token.approve(address(controller), 1 * USDC);
        controller.fundRewards(1 * USDC);
        token.transfer(address(controller), 1 * USDC);
        vm.stopPrank();
        assertEq(token.balanceOf(address(controller)), 2 * USDC);
    }

    function test_ConstructorRejectsNonSixDecimalRewardAsset() public {
        MockWrongDecimalsToken wrongDecimals = new MockWrongDecimalsToken();
        vm.expectRevert(RewardController.InvalidRewardAsset.selector);
        new RewardController(IERC20(address(wrongDecimals)), admin, qualifier, manager, pauser);
    }

    function test_OpenFundedEpochUsesSequentialSevenDayWindow() public {
        uint64 epochId = _fundAndOpenDemo();
        assertEq(epochId, 1);
        (
            uint64 startAt,
            uint64 endAt,
            uint32 rate,
            uint256 eligibleCap,
            uint256 qualificationCap,
            uint256 userCap,
            uint256 budget,
            uint256 allocated
        ) = controller.epochs(1);
        assertEq(endAt - startAt, 7 days);
        assertEq(rate, 384);
        assertEq(eligibleCap, 500 * USDC);
        assertEq(qualificationCap, 250_000);
        assertEq(userCap, 750_000);
        assertEq(budget, 6_250_000);
        assertEq(allocated, 0);
    }

    function test_OpenEpochRejectsUnderfundingAndOverlap() public {
        vm.prank(manager);
        vm.expectRevert();
        controller.openEpoch(384, 500 * USDC, 250_000, 750_000, 6_250_000);
        _fundAndOpenDemo();
        vm.prank(manager);
        vm.expectRevert();
        controller.openEpoch(384, 500 * USDC, 250_000, 750_000, 6_250_000);
    }

    function test_NextEpochStartsAtBoundaryAndIsSequential() public {
        _fundAndOpenDemo();
        vm.warp(block.timestamp + 7 days);
        vm.prank(manager);
        uint64 next = controller.openEpoch(384, 500 * USDC, 250_000, 750_000, 6_250_000);
        assertEq(next, 2);
    }

    function test_OpenEpochRejectsEveryHardCeilingAndInvalidRelation() public {
        controller.fundRewards(25 * USDC);
        uint256[7] memory modes = [uint256(0), 1, 2, 3, 4, 5, 6];
        for (uint256 i; i < modes.length; ++i) {
            uint32 rate = 384;
            uint256 eligible = 500 * USDC;
            uint256 qCap = 250_000;
            uint256 uCap = 750_000;
            uint256 budget = 6_250_000;
            if (i == 0) rate = 1_001;
            if (i == 1) eligible = 1_000 * USDC + 1;
            if (i == 2) qCap = 500_001;
            if (i == 3) uCap = 1_000_001;
            if (i == 4) budget = 10_000_001;
            if (i == 5) qCap = uCap + 1;
            if (i == 6) uCap = budget + 1;
            vm.prank(manager);
            vm.expectRevert();
            controller.openEpoch(rate, eligible, qCap, uCap, budget);
        }
    }

    function test_DeterministicFullConfidenceFormulaVector() public {
        uint64 epochId = _fundAndOpenDemo();
        uint256 reward = _register(keccak256("q1"), alice, epochId);
        assertEq(reward, 192_000);
    }

    function test_DeterministicEightyPercentConfidenceVector() public {
        uint64 epochId = _fundAndOpenDemo();
        vm.prank(qualifier);
        uint256 reward = controller.registerQualification(keccak256("q2"), alice, epochId, 500 * USDC, 8_000, 10_000);
        assertEq(reward, 153_600);
    }

    function test_StagedFloorRoundingVector() public {
        controller.fundRewards(1 * USDC);
        vm.prank(manager);
        uint64 epochId = controller.openEpoch(999, 999_999_999, 500_000, 1_000_000, 1_000_000);
        vm.prank(qualifier);
        vm.expectRevert(RewardController.ZeroReward.selector);
        controller.registerQualification(keccak256("round"), alice, epochId, 1_001, 9_999, 9_999);
    }

    function test_StagedFloorRoundingProducesExactRawUnits() public {
        controller.fundRewards(1 * USDC);
        vm.prank(manager);
        uint64 epochId = controller.openEpoch(999, 999_999_999, 500_000, 1_000_000, 1_000_000);
        vm.prank(qualifier);
        uint256 reward =
            controller.registerQualification(keccak256("round-positive"), alice, epochId, 1_001_002, 9_999, 9_999);
        assertEq(reward, 998);
    }

    function test_TwentyFiveUsdcPrefundsFourSequentialDemoEpochs() public {
        controller.fundRewards(25 * USDC);
        for (uint64 expected = 1; expected <= 4; ++expected) {
            vm.prank(manager);
            uint64 epochId = controller.openEpoch(384, 500 * USDC, 250_000, 750_000, 6_250_000);
            assertEq(epochId, expected);
            vm.warp(block.timestamp + 7 days);
        }
    }

    function test_EpochLowerEligibleCapIsApplied() public {
        uint64 epochId = _fundAndOpenDemo();
        vm.prank(qualifier);
        uint256 reward = controller.registerQualification(keccak256("cap"), alice, epochId, 900 * USDC, 10_000, 10_000);
        assertEq(reward, 192_000);
    }

    function test_QualificationCapAndUserCapClampAllocations() public {
        controller.fundRewards(10 * USDC);
        vm.prank(manager);
        uint64 epochId = controller.openEpoch(1_000, 1_000 * USDC, 250_000, 750_000, 6_250_000);
        for (uint256 i; i < 3; ++i) {
            vm.prank(qualifier);
            uint256 reward =
                controller.registerQualification(bytes32(i + 1), alice, epochId, 1_000 * USDC, 10_000, 10_000);
            assertEq(reward, 250_000);
        }
        vm.prank(qualifier);
        vm.expectRevert();
        controller.registerQualification(bytes32(uint256(4)), alice, epochId, 1_000 * USDC, 10_000, 10_000);
        assertEq(controller.userAllocated(epochId, alice), 750_000);
    }

    function test_TotalEpochBudgetClampsAcrossUsers() public {
        controller.fundRewards(1 * USDC);
        vm.prank(manager);
        uint64 epochId = controller.openEpoch(1_000, 1_000 * USDC, 500_000, 600_000, 600_000);
        vm.prank(qualifier);
        assertEq(
            controller.registerQualification(bytes32(uint256(1)), alice, epochId, 1_000 * USDC, 10_000, 10_000), 500_000
        );
        vm.prank(qualifier);
        assertEq(
            controller.registerQualification(bytes32(uint256(2)), bob, epochId, 1_000 * USDC, 10_000, 10_000), 100_000
        );
        vm.prank(qualifier);
        vm.expectRevert();
        controller.registerQualification(bytes32(uint256(3)), bob, epochId, 1_000 * USDC, 10_000, 10_000);
    }

    function test_RejectsUnauthorizedInvalidDuplicateAndExpiredQualifications() public {
        uint64 epochId = _fundAndOpenDemo();
        vm.prank(alice);
        vm.expectRevert();
        controller.registerQualification(keccak256("x"), alice, epochId, 1, 1, 1);
        vm.startPrank(qualifier);
        vm.expectRevert();
        controller.registerQualification(bytes32(0), alice, epochId, 1, 1, 1);
        vm.expectRevert();
        controller.registerQualification(keccak256("zero-recipient"), address(0), epochId, 1, 1, 1);
        vm.expectRevert();
        controller.registerQualification(keccak256("twab"), alice, epochId, 1_000 * USDC + 1, 1, 1);
        vm.expectRevert();
        controller.registerQualification(keccak256("confidence-zero"), alice, epochId, 1, 0, 1);
        vm.expectRevert();
        controller.registerQualification(keccak256("confidence-high"), alice, epochId, 1, 10_001, 1);
        vm.expectRevert();
        controller.registerQualification(keccak256("weight-zero"), alice, epochId, 1, 1, 0);
        vm.expectRevert();
        controller.registerQualification(keccak256("weight-high"), alice, epochId, 1, 1, 10_001);
        vm.stopPrank();
        bytes32 id = keccak256("duplicate");
        _register(id, alice, epochId);
        vm.prank(qualifier);
        vm.expectRevert();
        controller.registerQualification(id, alice, epochId, 1, 1, 1);
        vm.warp(block.timestamp + 7 days);
        vm.prank(qualifier);
        vm.expectRevert();
        controller.registerQualification(keccak256("expired"), alice, epochId, 1, 1, 1);
    }

    function test_InsufficientPhysicalUSDCRejectsEntitlement() public {
        uint64 epochId = _fundAndOpenDemo();
        token.burn(address(controller), 25 * USDC);
        vm.prank(qualifier);
        vm.expectRevert();
        controller.registerQualification(keccak256("insolvent"), alice, epochId, 500 * USDC, 10_000, 10_000);
        assertEq(controller.totalOutstandingClaimable(), 0);
    }

    function test_RecipientOnlyFullClaimPaysOnceAndNeverExpires() public {
        uint64 epochId = _fundAndOpenDemo();
        bytes32 id = keccak256("claim");
        uint256 reward = _register(id, alice, epochId);
        vm.warp(block.timestamp + 3650 days);
        vm.prank(bob);
        vm.expectRevert();
        controller.claim(id);
        vm.prank(alice);
        controller.claim(id);
        assertEq(token.balanceOf(alice), reward);
        assertEq(controller.totalOutstandingClaimable(), 0);
        vm.prank(alice);
        vm.expectRevert();
        controller.claim(id);
    }

    function test_PauseBlocksEpochQualificationAndClaimButNotFunding() public {
        uint64 epochId = _fundAndOpenDemo();
        bytes32 id = keccak256("paused-claim");
        _register(id, alice, epochId);
        vm.prank(pauser);
        controller.pause();
        controller.fundRewards(1 * USDC);
        vm.prank(qualifier);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        controller.registerQualification(keccak256("paused-q"), bob, epochId, 1, 1, 1);
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        controller.claim(id);
        vm.warp(block.timestamp + 7 days);
        vm.prank(manager);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        controller.openEpoch(1, 1, 1, 1, 1);
        vm.prank(pauser);
        controller.unpause();
        vm.prank(alice);
        controller.claim(id);
    }

    function test_PausingRewardControllerDoesNotBlockVaultWithdrawal() public {
        MockAToken aToken = new MockAToken(address(token));
        MockAavePool pool = new MockAavePool(token, aToken);
        KeptSavingsVault vault = new KeptSavingsVault(IERC20(address(token)), admin);
        AaveUSDCStrategy strategy =
            new AaveUSDCStrategy(address(vault), address(token), address(pool), address(aToken));
        vm.prank(admin);
        vault.bindStrategy(address(strategy));
        token.mint(alice, 10 * USDC);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.deposit(10 * USDC, alice);

        vm.prank(pauser);
        controller.pause();
        vm.prank(alice);
        vault.withdraw(10 * USDC, alice, alice);

        assertEq(token.balanceOf(alice), 10 * USDC);
        assertEq(vault.balanceOf(alice), 0);
    }

    function test_NoAdminTreasurySweepOrVaultStrategyAuthority() public {
        token.transfer(address(controller), 1 * USDC);
        vm.startPrank(admin);
        (bool sweep,) = address(controller).call(abi.encodeWithSignature("withdraw(address,uint256)", admin, 1 * USDC));
        (bool rescue,) = address(controller)
            .call(abi.encodeWithSignature("rescueTokens(address,address,uint256)", address(token), admin, 1 * USDC));
        (bool vaultCall,) = address(controller).call(abi.encodeWithSignature("deposit(uint256,address)", 1, admin));
        vm.stopPrank();
        assertFalse(sweep);
        assertFalse(rescue);
        assertFalse(vaultCall);
        assertEq(token.balanceOf(address(controller)), 1 * USDC);
    }

    function testFuzz_RewardMatchesIndependentStagedFloorCalculation(
        uint96 twabRaw,
        uint16 confidence,
        uint16 weight
    ) public {
        uint256 twab = bound(uint256(twabRaw), 1, 1_000 * USDC);
        confidence = uint16(bound(uint256(confidence), 1, 10_000));
        weight = uint16(bound(uint256(weight), 1, 10_000));
        controller.fundRewards(10 * USDC);
        vm.prank(manager);
        uint64 epochId = controller.openEpoch(1_000, 1_000 * USDC, 500_000, 1_000_000, 10_000_000);
        uint256 expected = (twab * 1_000) / 1_000_000;
        expected = (expected * confidence) / 10_000;
        expected = (expected * weight) / 10_000;
        if (expected > 500_000) expected = 500_000;

        vm.prank(qualifier);
        if (expected == 0) {
            vm.expectRevert(RewardController.ZeroReward.selector);
            controller.registerQualification(
                keccak256(abi.encode(twab, confidence, weight)), alice, epochId, twab, confidence, weight
            );
        } else {
            uint256 reward = controller.registerQualification(
                keccak256(abi.encode(twab, confidence, weight)), alice, epochId, twab, confidence, weight
            );
            assertEq(reward, expected);
            assertLe(reward, 500_000);
            assertEq(controller.userAllocated(epochId, alice), reward);
            assertEq(controller.totalOutstandingClaimable(), reward);
            assertLe(controller.totalOutstandingClaimable(), token.balanceOf(address(controller)));
        }
    }

    function testFuzz_TwABBeyondHardCeilingAlwaysRejects(uint96 excessRaw) public {
        uint256 excess = bound(uint256(excessRaw), 1, type(uint96).max - 1_000 * USDC);
        uint256 twab = 1_000 * USDC + excess;
        controller.fundRewards(10 * USDC);
        vm.prank(manager);
        uint64 epochId = controller.openEpoch(1_000, 1_000 * USDC, 500_000, 1_000_000, 10_000_000);
        vm.prank(qualifier);
        vm.expectRevert(RewardController.QualificationInputExceedsHardCeiling.selector);
        controller.registerQualification(keccak256(abi.encode(twab)), alice, epochId, twab, 10_000, 10_000);
    }
}
