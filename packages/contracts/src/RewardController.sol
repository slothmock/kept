// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract RewardController is AccessControl, Pausable {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    uint256 public constant RATE_DENOMINATOR = 1_000_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint64 public constant EPOCH_DURATION = 7 days;
    uint256 public constant MAX_ELIGIBLE_BALANCE = 1_000e6;
    uint32 public constant MAX_PERIOD_RATE_PPM = 1_000;
    uint16 public constant MAX_CONFIDENCE_BPS = 10_000;
    uint16 public constant MAX_REWARD_WEIGHT_BPS = 10_000;
    uint256 public constant MAX_REWARD_PER_QUALIFICATION = 500_000;
    uint256 public constant MAX_REWARD_PER_USER_PER_EPOCH = 1_000_000;
    uint256 public constant MAX_TOTAL_REWARDS_PER_EPOCH = 10_000_000;

    bytes32 public constant QUALIFIER_ROLE = keccak256("QUALIFIER_ROLE");
    bytes32 public constant EPOCH_MANAGER_ROLE = keccak256("EPOCH_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error InvalidRewardAsset();
    error InvalidRoleHolder();
    error InvalidQualificationId();
    error InvalidRecipient();
    error QualificationAlreadyRegistered(bytes32 qualificationId);
    error EpochNotActive(uint64 epochId);
    error NoActiveEpoch();
    error PreviousEpochStillActive(uint64 epochId);
    error QualificationInputExceedsHardCeiling();
    error InvalidConfidence();
    error InvalidRewardWeight();
    error HardCeilingExceeded();
    error EpochBudgetExhausted();
    error UserCapExhausted();
    error ZeroReward();
    error InsufficientRewardFunding(uint256 required, uint256 available);
    error AlreadyClaimed(bytes32 qualificationId);
    error NotQualificationRecipient(address caller);
    error InvalidEpochConfiguration();

    event RewardsFunded(address indexed funder, uint256 amount);
    event EpochOpened(
        uint64 indexed epochId,
        uint64 startAt,
        uint64 endAt,
        uint32 periodRatePpm,
        uint256 eligibleBalanceCap,
        uint256 qualificationCap,
        uint256 userCap,
        uint256 budget
    );
    event QualificationRegistered(
        bytes32 indexed qualificationId, address indexed recipient, uint64 indexed epochId, uint256 rewardAmount
    );
    event RewardClaimed(bytes32 indexed qualificationId, address indexed recipient, uint256 amount);

    struct Epoch {
        uint64 startAt;
        uint64 endAt;
        uint32 periodRatePpm;
        uint256 eligibleBalanceCap;
        uint256 qualificationCap;
        uint256 userCap;
        uint256 budget;
        uint256 allocated;
    }

    struct Qualification {
        address recipient;
        uint64 epochId;
        uint256 rewardAmount;
        bool claimed;
    }

    IERC20 public immutable rewardAsset;
    uint64 public currentEpochId;
    uint256 public totalOutstandingClaimable;
    mapping(uint64 epochId => Epoch epoch) public epochs;
    mapping(bytes32 qualificationId => Qualification qualification) public qualifications;
    mapping(uint64 epochId => mapping(address recipient => uint256 allocated)) public userAllocated;

    constructor(IERC20 rewardAsset_, address admin, address qualifier, address epochManager, address pauser) {
        if (
            address(rewardAsset_) == address(0) || address(rewardAsset_).code.length == 0
                || IERC20Metadata(address(rewardAsset_)).decimals() != 6
        ) {
            revert InvalidRewardAsset();
        }
        if (admin == address(0) || qualifier == address(0) || epochManager == address(0) || pauser == address(0)) {
            revert InvalidRoleHolder();
        }
        rewardAsset = rewardAsset_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(QUALIFIER_ROLE, qualifier);
        _grantRole(EPOCH_MANAGER_ROLE, epochManager);
        _grantRole(PAUSER_ROLE, pauser);
    }

    function fundRewards(uint256 assets) external {
        if (assets == 0) revert ZeroReward();
        rewardAsset.safeTransferFrom(msg.sender, address(this), assets);
        emit RewardsFunded(msg.sender, assets);
    }

    function openEpoch(
        uint32 periodRatePpm,
        uint256 eligibleBalanceCap,
        uint256 qualificationCap,
        uint256 userCap,
        uint256 budget
    ) external onlyRole(EPOCH_MANAGER_ROLE) whenNotPaused returns (uint64 epochId) {
        if (currentEpochId != 0 && block.timestamp < epochs[currentEpochId].endAt) {
            revert PreviousEpochStillActive(currentEpochId);
        }
        _validateEpochConfiguration(periodRatePpm, eligibleBalanceCap, qualificationCap, userCap, budget);

        uint256 balance = rewardAsset.balanceOf(address(this));
        uint256 available = balance >= totalOutstandingClaimable ? balance - totalOutstandingClaimable : 0;
        if (available < budget) revert InsufficientRewardFunding(budget, available);

        epochId = currentEpochId + 1;
        currentEpochId = epochId;
        uint64 startAt = block.timestamp.toUint64();
        uint64 endAt = startAt + EPOCH_DURATION;
        epochs[epochId] = Epoch({
            startAt: startAt,
            endAt: endAt,
            periodRatePpm: periodRatePpm,
            eligibleBalanceCap: eligibleBalanceCap,
            qualificationCap: qualificationCap,
            userCap: userCap,
            budget: budget,
            allocated: 0
        });
        emit EpochOpened(epochId, startAt, endAt, periodRatePpm, eligibleBalanceCap, qualificationCap, userCap, budget);
    }

    function registerQualification(
        bytes32 qualificationId,
        address recipient,
        uint64 epochId,
        uint256 twabAssets,
        uint16 confidenceBps,
        uint16 rewardWeightBps
    ) external onlyRole(QUALIFIER_ROLE) whenNotPaused returns (uint256 reward) {
        if (qualificationId == bytes32(0)) revert InvalidQualificationId();
        if (recipient == address(0)) revert InvalidRecipient();
        if (qualifications[qualificationId].recipient != address(0)) {
            revert QualificationAlreadyRegistered(qualificationId);
        }
        if (currentEpochId == 0) revert NoActiveEpoch();
        Epoch storage epoch = epochs[epochId];
        if (epochId != currentEpochId || block.timestamp < epoch.startAt || block.timestamp >= epoch.endAt) {
            revert EpochNotActive(epochId);
        }
        if (twabAssets > MAX_ELIGIBLE_BALANCE) revert QualificationInputExceedsHardCeiling();
        if (confidenceBps == 0 || confidenceBps > MAX_CONFIDENCE_BPS) revert InvalidConfidence();
        if (rewardWeightBps == 0 || rewardWeightBps > MAX_REWARD_WEIGHT_BPS) revert InvalidRewardWeight();

        uint256 previousUserAllocation = userAllocated[epochId][recipient];
        if (previousUserAllocation >= epoch.userCap) revert UserCapExhausted();
        if (epoch.allocated >= epoch.budget) revert EpochBudgetExhausted();

        reward = _calculateReward(epoch, previousUserAllocation, twabAssets, confidenceBps, rewardWeightBps);
        if (reward == 0) revert ZeroReward();

        uint256 required = totalOutstandingClaimable + reward;
        uint256 physicalBalance = rewardAsset.balanceOf(address(this));
        if (physicalBalance < required) revert InsufficientRewardFunding(required, physicalBalance);

        epoch.allocated += reward;
        userAllocated[epochId][recipient] = previousUserAllocation + reward;
        totalOutstandingClaimable = required;
        qualifications[qualificationId] =
            Qualification({recipient: recipient, epochId: epochId, rewardAmount: reward, claimed: false});
        emit QualificationRegistered(qualificationId, recipient, epochId, reward);
    }

    function claim(bytes32 qualificationId) external whenNotPaused {
        Qualification storage qualification = qualifications[qualificationId];
        if (qualification.recipient != msg.sender) revert NotQualificationRecipient(msg.sender);
        if (qualification.claimed) revert AlreadyClaimed(qualificationId);

        qualification.claimed = true;
        totalOutstandingClaimable -= qualification.rewardAmount;
        rewardAsset.safeTransfer(msg.sender, qualification.rewardAmount);
        emit RewardClaimed(qualificationId, msg.sender, qualification.rewardAmount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _validateEpochConfiguration(
        uint32 periodRatePpm,
        uint256 eligibleBalanceCap,
        uint256 qualificationCap,
        uint256 userCap,
        uint256 budget
    ) internal pure {
        if (
            periodRatePpm == 0 || eligibleBalanceCap == 0 || qualificationCap == 0 || userCap == 0 || budget == 0
                || qualificationCap > userCap || userCap > budget
        ) revert InvalidEpochConfiguration();
        if (
            periodRatePpm > MAX_PERIOD_RATE_PPM || eligibleBalanceCap > MAX_ELIGIBLE_BALANCE
                || qualificationCap > MAX_REWARD_PER_QUALIFICATION || userCap > MAX_REWARD_PER_USER_PER_EPOCH
                || budget > MAX_TOTAL_REWARDS_PER_EPOCH
        ) revert HardCeilingExceeded();
    }

    function _calculateReward(
        Epoch storage epoch,
        uint256 previousUserAllocation,
        uint256 twabAssets,
        uint16 confidenceBps,
        uint16 rewardWeightBps
    ) internal view returns (uint256) {
        uint256 eligibleAssets = Math.min(twabAssets, epoch.eligibleBalanceCap);
        uint256 reward = Math.mulDiv(eligibleAssets, epoch.periodRatePpm, RATE_DENOMINATOR);
        reward = Math.mulDiv(reward, confidenceBps, BPS_DENOMINATOR);
        reward = Math.mulDiv(reward, rewardWeightBps, BPS_DENOMINATOR);
        reward = Math.min(reward, Math.min(epoch.qualificationCap, MAX_REWARD_PER_QUALIFICATION));
        reward = Math.min(reward, epoch.userCap - previousUserAllocation);
        return Math.min(reward, epoch.budget - epoch.allocated);
    }
}
