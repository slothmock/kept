// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {RewardController} from "../src/RewardController.sol";
import {MockUSDC, MockAToken, MockAavePool} from "./mocks/MockAave.sol";

contract VaultHandler is Test {
    MockUSDC public immutable token;
    MockAToken public immutable aToken;
    KeptSavingsVault public immutable vault;
    AaveUSDCStrategy public immutable strategy;

    bool public strategyAuthorityViolation;
    bool public ownerPrincipalViolation;
    bool public feeCeilingViolation;

    constructor(MockUSDC token_, MockAToken aToken_, KeptSavingsVault vault_, AaveUSDCStrategy strategy_) {
        token = token_;
        aToken = aToken_;
        vault = vault_;
        strategy = strategy_;
        token_.approve(address(vault_), type(uint256).max);
    }

    function deposit(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000e6);
        token.mint(address(this), amount);
        vault.deposit(amount, address(this));
    }

    function mint(uint96 rawShares) external {
        uint256 shares = bound(uint256(rawShares), 1, 100e6);
        uint256 assets = vault.previewMint(shares);
        token.mint(address(this), assets);
        vault.mint(shares, address(this));
    }

    function withdraw(uint96 rawAmount) external {
        uint256 max = vault.maxWithdraw(address(this));
        if (max == 0) return;
        vault.withdraw(bound(uint256(rawAmount), 1, max), address(this), address(this));
    }

    function redeem(uint96 rawShares) external {
        uint256 maximum = vault.maxRedeem(address(this));
        if (maximum == 0) return;
        vault.redeem(bound(uint256(rawShares), 1, maximum), address(this), address(this));
    }

    function donate(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, 100e6);
        token.mint(address(this), amount);
        token.transfer(address(vault), amount);
    }

    function accrueYieldAndCrystallize(uint96 rawYield, uint32 rawElapsed) external {
        uint256 amount = bound(uint256(rawYield), 1, 100e6);
        uint256 elapsed = bound(uint256(rawElapsed), 1 hours, 30 days);
        vm.warp(block.timestamp + elapsed);
        aToken.accrueYield(address(strategy), amount);

        uint256 assets = vault.totalAssets();
        uint256 profit = assets > vault.highWaterMarkAssets() ? assets - vault.highWaterMarkAssets() : 0;
        uint256 profitCap = profit * vault.profitFeeCapBps() / vault.BPS_DENOMINATOR();
        uint256 checkpointAssets = vault.feeCheckpointAssets();
        uint256 conservativeAssets = checkpointAssets < assets ? checkpointAssets : assets;
        uint256 assetSeconds =
            vault.accruedFeeAssetSeconds() + conservativeAssets * (block.timestamp - vault.lastFeeCheckpointAt());
        uint256 annualCap = assetSeconds * vault.annualFeeCapBps() / (vault.BPS_DENOMINATOR() * vault.FEE_YEAR());
        uint256 expectedMaximum = profitCap < annualCap ? profitCap : annualCap;

        (uint256 feeAssets,) = vault.crystallizeYieldFee();
        if (feeAssets > expectedMaximum) feeCeilingViolation = true;
    }

    function crystallize() external {
        vault.crystallizeYieldFee();
    }

    function callStrategyDirectly(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, 100e6);
        try strategy.deposit(amount) returns (uint256) {
            strategyAuthorityViolation = true;
        } catch {}
        try strategy.withdraw(amount) returns (uint256) {
            strategyAuthorityViolation = true;
        } catch {}
    }

    function exerciseOwnerOperations() external {
        uint256 sharesBefore = vault.balanceOf(address(this));
        if (vault.paused()) {
            vm.prank(vault.owner());
            vault.unpause();
        } else {
            vm.prank(vault.owner());
            vault.pause();
        }
        if (vault.balanceOf(address(this)) < sharesBefore) ownerPrincipalViolation = true;
    }
}

contract VaultInvariantTest is StdInvariant, Test {
    MockUSDC internal token;
    MockAToken internal aToken;
    KeptSavingsVault internal vault;
    AaveUSDCStrategy internal strategy;
    VaultHandler internal handler;

    function setUp() public {
        token = new MockUSDC();
        aToken = new MockAToken(address(token));
        MockAavePool pool = new MockAavePool(token, aToken);
        vault = new KeptSavingsVault(IERC20(address(token)), address(this), address(this), 100, 2_500);
        strategy = new AaveUSDCStrategy(address(vault), address(token), address(pool), address(aToken));
        vault.bindStrategy(address(strategy));
        handler = new VaultHandler(token, aToken, vault, strategy);
        targetContract(address(handler));
    }

    function invariant_TotalAssetsEqualsIdlePlusStrategy() public view {
        assertEq(vault.totalAssets(), token.balanceOf(address(vault)) + strategy.totalAssets());
    }

    function invariant_StrategyPositionCannotExceedVaultAssets() public view {
        assertLe(strategy.totalAssets(), vault.totalAssets());
    }

    function invariant_StrategyAssetMovementIsVaultOnly() public view {
        assertFalse(handler.strategyAuthorityViolation());
    }

    function invariant_OwnerOperationsCannotReduceUserShares() public view {
        assertFalse(handler.ownerPrincipalViolation());
    }

    function invariant_YieldFeesNeverExceedEitherCeiling() public view {
        assertFalse(handler.feeCeilingViolation());
    }
}

contract RewardHandler is Test {
    RewardController public immutable controller;
    uint64 public immutable epochId;
    uint256 public expectedOutstanding;
    uint256 public nonce;
    bytes32[] public ids;
    address[3] public recipients;
    bool public duplicateRegistrationSucceeded;
    bool public repeatedClaimSucceeded;

    constructor(RewardController controller_, uint64 epochId_) {
        controller = controller_;
        epochId = epochId_;
        recipients = [address(0xA11CE), address(0xB0B), address(0xCA11)];
    }

    function register(uint8 rawRecipient, uint96 rawTwab, uint16 rawConfidence, uint16 rawWeight) external {
        uint256 twab = bound(uint256(rawTwab), 1, 1_000e6);
        uint16 confidence = uint16(bound(uint256(rawConfidence), 1, 10_000));
        uint16 weight = uint16(bound(uint256(rawWeight), 1, 10_000));
        bytes32 id = keccak256(abi.encode(++nonce));
        address recipient = recipients[uint256(rawRecipient) % recipients.length];
        try controller.registerQualification(id, recipient, epochId, twab, confidence, weight) returns (
            uint256 reward
        ) {
            expectedOutstanding += reward;
            ids.push(id);
        } catch {}
    }

    function claim(uint256 index) external {
        if (ids.length == 0) return;
        bytes32 id = ids[index % ids.length];
        (address recipient,, uint256 reward, bool claimed) = controller.qualifications(id);
        if (claimed) return;
        vm.prank(recipient);
        controller.claim(id);
        expectedOutstanding -= reward;
    }

    function attemptDuplicate(uint256 index, uint96 rawTwab) external {
        if (ids.length == 0) return;
        bytes32 id = ids[index % ids.length];
        (address recipient,,,) = controller.qualifications(id);
        uint256 twab = bound(uint256(rawTwab), 1, 1_000e6);
        try controller.registerQualification(id, recipient, epochId, twab, 10_000, 10_000) returns (uint256) {
            duplicateRegistrationSucceeded = true;
        } catch {}
    }

    function attemptRepeatedClaim(uint256 index) external {
        if (ids.length == 0) return;
        bytes32 id = ids[index % ids.length];
        (address recipient,,, bool claimed) = controller.qualifications(id);
        if (!claimed) return;
        vm.prank(recipient);
        try controller.claim(id) {
            repeatedClaimSucceeded = true;
        } catch {}
    }

    function qualificationCount() external view returns (uint256) {
        return ids.length;
    }

    function qualificationAt(uint256 index) external view returns (bytes32) {
        return ids[index];
    }
}

contract RewardInvariantTest is StdInvariant, Test {
    MockUSDC internal token;
    RewardController internal controller;
    RewardHandler internal handler;
    uint64 internal epochId;

    function setUp() public {
        token = new MockUSDC();
        controller =
            new RewardController(IERC20(address(token)), address(this), address(this), address(this), address(this));
        token.mint(address(controller), 10e6);
        epochId = controller.openEpoch(1_000, 1_000e6, 500_000, 1_000_000, 10_000_000);
        handler = new RewardHandler(controller, epochId);
        controller.grantRole(controller.QUALIFIER_ROLE(), address(handler));
        targetContract(address(handler));
    }

    function invariant_OutstandingEqualsTrackedUnclaimedEntitlements() public view {
        assertEq(controller.totalOutstandingClaimable(), handler.expectedOutstanding());
    }

    function invariant_OutstandingIsPhysicallySolvent() public view {
        assertGe(token.balanceOf(address(controller)), controller.totalOutstandingClaimable());
    }

    function invariant_EpochAndUserCapsHold() public view {
        (,,,, uint256 qCap, uint256 userCap, uint256 budget, uint256 allocated) = controller.epochs(epochId);
        assertLe(allocated, budget);
        assertLe(allocated, controller.MAX_TOTAL_REWARDS_PER_EPOCH());
        for (uint256 i; i < 3; ++i) {
            assertLe(controller.userAllocated(epochId, handler.recipients(i)), userCap);
        }
        assertLe(userCap, controller.MAX_REWARD_PER_USER_PER_EPOCH());
        assertLe(qCap, controller.MAX_REWARD_PER_QUALIFICATION());
    }

    function invariant_EveryEntitlementRespectsQualificationCaps() public view {
        (,,,, uint256 qualificationCap,,,) = controller.epochs(epochId);
        uint256 count = handler.qualificationCount();
        for (uint256 i; i < count; ++i) {
            (,, uint256 reward,) = controller.qualifications(handler.qualificationAt(i));
            assertLe(reward, qualificationCap);
            assertLe(reward, controller.MAX_REWARD_PER_QUALIFICATION());
        }
    }

    function invariant_QualificationCreatesAtMostOneEntitlement() public view {
        assertFalse(handler.duplicateRegistrationSucceeded());
    }

    function invariant_QualificationCanPayAtMostOnce() public view {
        assertFalse(handler.repeatedClaimSucceeded());
    }
}
