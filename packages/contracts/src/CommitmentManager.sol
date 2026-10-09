// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IKeptTreasury} from "./interfaces/IKeptTreasury.sol";

contract CommitmentManager is Ownable2Step, Pausable, ReentrancyGuard {
    enum CommitmentStatus {
        None,
        Active,
        Completed,
        Failed,
        Cancelled
    }

    struct Commitment {
        address owner;
        bytes32 referenceId;
        uint64 createdAt;
        uint64 startAt;
        uint64 endAt;
        uint256 rewardAssets;
        CommitmentStatus status;
        bool rewardClaimed;
    }

    IKeptTreasury public immutable treasury;

    address public verifier;

    uint256 public nextCommitmentId = 1;

    mapping(uint256 commitmentId => Commitment commitment) public commitments;

    mapping(bytes32 referenceId => bool used) public referenceUsed;

    error InvalidTreasury();
    error InvalidVerifier();
    error InvalidReferenceId();
    error InvalidTimeRange();
    error InvalidCommitment();

    error UnauthorizedVerifier(address caller);

    error ReferenceAlreadyUsed(bytes32 referenceId);

    error CommitmentNotOwner();
    error CommitmentNotActive();
    error CommitmentNotCompleted();
    error CommitmentNotEnded();

    error RewardAlreadyClaimed();
    error NoReward();

    event VerifierUpdated(
        address indexed previousVerifier,
        address indexed newVerifier
    );

    event CommitmentCreated(
        uint256 indexed commitmentId,
        address indexed owner,
        bytes32 indexed referenceId,
        uint64 startAt,
        uint64 endAt
    );

    event CommitmentCompleted(
        uint256 indexed commitmentId,
        uint256 rewardAssets
    );

    event CommitmentFailed(uint256 indexed commitmentId);

    event CommitmentCancelled(uint256 indexed commitmentId);

    event RewardClaimed(
        uint256 indexed commitmentId,
        address indexed owner,
        uint256 assets
    );

    modifier onlyVerifier() {
        if (msg.sender != verifier) {
            revert UnauthorizedVerifier(msg.sender);
        }

        _;
    }

    constructor(
        IKeptTreasury treasury_,
        address initialOwner,
        address verifier_
    ) Ownable(initialOwner) {
        if (address(treasury_) == address(0)) {
            revert InvalidTreasury();
        }

        if (verifier_ == address(0)) {
            revert InvalidVerifier();
        }

        treasury = treasury_;
        verifier = verifier_;
    }

    /// @notice Change the authorised verification
    /// service/address.
    function setVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) {
            revert InvalidVerifier();
        }

        address previousVerifier = verifier;

        verifier = newVerifier;

        emit VerifierUpdated(previousVerifier, newVerifier);
    }

    /// @notice Create a commitment.
    ///
    /// @dev referenceId should point to private/offchain
    /// commitment metadata without exposing that metadata.
    function createCommitment(
        bytes32 referenceId,
        uint64 startAt,
        uint64 endAt
    ) external whenNotPaused returns (uint256 commitmentId) {
        if (referenceId == bytes32(0)) {
            revert InvalidReferenceId();
        }

        if (referenceUsed[referenceId]) {
            revert ReferenceAlreadyUsed(referenceId);
        }

        if (startAt < block.timestamp || endAt <= startAt) {
            revert InvalidTimeRange();
        }

        commitmentId = nextCommitmentId++;

        referenceUsed[referenceId] = true;

        commitments[commitmentId] = Commitment({
            owner: msg.sender,
            referenceId: referenceId,
            createdAt: SafeCast.toUint64(block.timestamp),
            startAt: startAt,
            endAt: endAt,
            rewardAssets: 0,
            status: CommitmentStatus.Active,
            rewardClaimed: false
        });

        emit CommitmentCreated(
            commitmentId,
            msg.sender,
            referenceId,
            startAt,
            endAt
        );
    }

    /// @notice Mark a commitment as successfully
    /// verified and assign its reward.
    ///
    /// @dev Reward size is chosen by the trusted verifier,
    /// not by the user.
    function completeCommitment(
        uint256 commitmentId,
        uint256 rewardAssets
    ) external onlyVerifier whenNotPaused {
        Commitment storage commitment = commitments[commitmentId];

        if (commitment.owner == address(0)) {
            revert InvalidCommitment();
        }

        if (commitment.status != CommitmentStatus.Active) {
            revert CommitmentNotActive();
        }

        if (block.timestamp < commitment.endAt) {
            revert CommitmentNotEnded();
        }

        if (rewardAssets == 0) {
            revert NoReward();
        }

        commitment.status = CommitmentStatus.Completed;

        commitment.rewardAssets = rewardAssets;

        emit CommitmentCompleted(commitmentId, rewardAssets);
    }

    /// @notice Mark a commitment as unsuccessful.
    function failCommitment(
        uint256 commitmentId
    ) external onlyVerifier whenNotPaused {
        Commitment storage commitment = commitments[commitmentId];

        if (commitment.owner == address(0)) {
            revert InvalidCommitment();
        }

        if (commitment.status != CommitmentStatus.Active) {
            revert CommitmentNotActive();
        }

        if (block.timestamp < commitment.endAt) {
            revert CommitmentNotEnded();
        }

        commitment.status = CommitmentStatus.Failed;

        emit CommitmentFailed(commitmentId);
    }

    /// @notice Users may cancel their own active
    /// commitments without affecting their funds.
    function cancelCommitment(uint256 commitmentId) external whenNotPaused {
        Commitment storage commitment = commitments[commitmentId];

        if (commitment.owner == address(0)) {
            revert InvalidCommitment();
        }

        if (commitment.owner != msg.sender) {
            revert CommitmentNotOwner();
        }

        if (commitment.status != CommitmentStatus.Active) {
            revert CommitmentNotActive();
        }

        commitment.status = CommitmentStatus.Cancelled;

        emit CommitmentCancelled(commitmentId);
    }

    /// @notice Claim the reward assigned to a
    /// successfully verified commitment.
    function claimReward(
        uint256 commitmentId
    ) external nonReentrant whenNotPaused {
        Commitment storage commitment = commitments[commitmentId];

        if (commitment.owner == address(0)) {
            revert InvalidCommitment();
        }

        if (commitment.owner != msg.sender) {
            revert CommitmentNotOwner();
        }

        if (commitment.status != CommitmentStatus.Completed) {
            revert CommitmentNotCompleted();
        }

        if (commitment.rewardClaimed) {
            revert RewardAlreadyClaimed();
        }

        if (commitment.rewardAssets == 0) {
            revert NoReward();
        }

        /*
         * Effects before interaction.
         *
         * If treasury.payReward() reverts,
         * this state change rolls back too.
         */
        commitment.rewardClaimed = true;

        bytes32 rewardId = keccak256(
            abi.encode(address(this), commitmentId, commitment.referenceId)
        );

        treasury.payReward(rewardId, commitment.owner, commitment.rewardAssets);

        emit RewardClaimed(
            commitmentId,
            commitment.owner,
            commitment.rewardAssets
        );
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
