// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {CommitmentManager} from "../src/CommitmentManager.sol";
import {IKeptTreasury} from "../src/interfaces/IKeptTreasury.sol";

contract MockKeptTreasury is IKeptTreasury {
    bytes32 public lastRewardId;
    address public lastRecipient;
    uint256 public lastAssets;
    uint256 public paymentCount;

    function payReward(
        bytes32 rewardId,
        address recipient,
        uint256 assets
    )
        external
    {
        lastRewardId = rewardId;
        lastRecipient = recipient;
        lastAssets = assets;
        paymentCount++;
    }
}

contract CommitmentManagerTest is Test {
    MockKeptTreasury internal treasury;
    CommitmentManager internal manager;

    address internal owner =
        makeAddr("owner");

    address internal verifier =
        makeAddr("verifier");

    address internal alice =
        makeAddr("alice");

    address internal bob =
        makeAddr("bob");

    function setUp() public {
        treasury =
            new MockKeptTreasury();

        manager =
            new CommitmentManager(
                IKeptTreasury(
                    address(treasury)
                ),
                owner,
                verifier
            );
    }

    function _createAliceCommitment()
        internal
        returns (
            uint256 commitmentId,
            bytes32 referenceId
        )
    {
        referenceId =
            keccak256(
                "alice-run-week-one"
            );

        uint64 startAt =
            uint64(
                block.timestamp + 1
            );

        uint64 endAt =
            uint64(
                block.timestamp + 7 days
            );

        vm.prank(alice);

        commitmentId =
            manager.createCommitment(
                referenceId,
                startAt,
                endAt
            );
    }

    function test_UserCanCreateCommitment()
        public
    {
        (
            uint256 id,
            bytes32 referenceId
        ) =
            _createAliceCommitment();

        (
            address commitmentOwner,
            bytes32 storedReference,
            ,
            ,
            ,
            uint256 rewardAssets,
            CommitmentManager
                .CommitmentStatus status,
            bool rewardClaimed
        ) =
            manager.commitments(id);

        assertEq(
            commitmentOwner,
            alice
        );

        assertEq(
            storedReference,
            referenceId
        );

        assertEq(
            rewardAssets,
            0
        );

        assertEq(
            uint256(status),
            uint256(
                CommitmentManager
                    .CommitmentStatus
                    .Active
            )
        );

        assertFalse(
            rewardClaimed
        );
    }

    function test_DuplicateReferenceFails()
        public
    {
        (
            ,
            bytes32 referenceId
        ) =
            _createAliceCommitment();

        vm.prank(bob);

        vm.expectRevert(
            abi.encodeWithSelector(
                CommitmentManager
                    .ReferenceAlreadyUsed
                    .selector,
                referenceId
            )
        );

        manager.createCommitment(
            referenceId,
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 7 days)
        );
    }

    function test_OnlyVerifierCanComplete()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(alice);

        vm.expectRevert(
            abi.encodeWithSelector(
                CommitmentManager
                    .UnauthorizedVerifier
                    .selector,
                alice
            )
        );

        manager.completeCommitment(
            id,
            5e6
        );
    }

    function test_VerifierCanComplete()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(verifier);

        manager.completeCommitment(
            id,
            5e6
        );

        (
            ,
            ,
            ,
            ,
            ,
            uint256 rewardAssets,
            CommitmentManager
                .CommitmentStatus status,
        ) =
            manager.commitments(id);

        assertEq(
            rewardAssets,
            5e6
        );

        assertEq(
            uint256(status),
            uint256(
                CommitmentManager
                    .CommitmentStatus
                    .Completed
            )
        );
    }

    function test_VerifierCanFailCommitment()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(verifier);

        manager.failCommitment(id);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            CommitmentManager
                .CommitmentStatus status,
        ) =
            manager.commitments(id);

        assertEq(
            uint256(status),
            uint256(
                CommitmentManager
                    .CommitmentStatus
                    .Failed
            )
        );
    }

    function test_OwnerCanCancelActiveCommitment()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(alice);

        manager.cancelCommitment(id);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            CommitmentManager
                .CommitmentStatus status,
        ) =
            manager.commitments(id);

        assertEq(
            uint256(status),
            uint256(
                CommitmentManager
                    .CommitmentStatus
                    .Cancelled
            )
        );
    }

    function test_OtherUserCannotCancelCommitment()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(bob);

        vm.expectRevert(
            CommitmentManager
                .CommitmentNotOwner
                .selector
        );

        manager.cancelCommitment(id);
    }

    function test_CompletedCommitmentCanClaimReward()
        public
    {
        (
            uint256 id,
            bytes32 referenceId
        ) =
            _createAliceCommitment();

        vm.prank(verifier);

        manager.completeCommitment(
            id,
            5e6
        );

        vm.prank(alice);

        manager.claimReward(id);

        assertEq(
            treasury.lastRecipient(),
            alice
        );

        assertEq(
            treasury.lastAssets(),
            5e6
        );

        bytes32 expectedRewardId =
            keccak256(
                abi.encode(
                    address(manager),
                    id,
                    referenceId
                )
            );

        assertEq(
            treasury.lastRewardId(),
            expectedRewardId
        );

        assertEq(
            treasury.paymentCount(),
            1
        );
    }

    function test_RewardCannotBeClaimedTwice()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(verifier);

        manager.completeCommitment(
            id,
            5e6
        );

        vm.prank(alice);
        manager.claimReward(id);

        vm.prank(alice);

        vm.expectRevert(
            CommitmentManager
                .RewardAlreadyClaimed
                .selector
        );

        manager.claimReward(id);
    }

    function test_FailedCommitmentCannotClaimReward()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(verifier);
        manager.failCommitment(id);

        vm.prank(alice);

        vm.expectRevert(
            CommitmentManager
                .CommitmentNotCompleted
                .selector
        );

        manager.claimReward(id);
    }

    function test_CancelledCommitmentCannotClaimReward()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(alice);
        manager.cancelCommitment(id);

        vm.prank(alice);

        vm.expectRevert(
            CommitmentManager
                .CommitmentNotCompleted
                .selector
        );

        manager.claimReward(id);
    }

    function test_CompletedCommitmentWithZeroRewardCannotClaim()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(verifier);

        manager.completeCommitment(
            id,
            0
        );

        vm.prank(alice);

        vm.expectRevert(
            CommitmentManager
                .NoReward
                .selector
        );

        manager.claimReward(id);
    }

    function test_OwnerCanRotateVerifier()
        public
    {
        address newVerifier =
            makeAddr("newVerifier");

        vm.prank(owner);

        manager.setVerifier(
            newVerifier
        );

        assertEq(
            manager.verifier(),
            newVerifier
        );
    }

    function test_NonOwnerCannotRotateVerifier()
        public
    {
        vm.prank(alice);

        vm.expectRevert();

        manager.setVerifier(
            makeAddr("newVerifier")
        );
    }

    function test_PauseBlocksCommitmentCreation()
        public
    {
        vm.prank(owner);
        manager.pause();

        vm.prank(alice);
        vm.expectRevert();

        manager.createCommitment(
            keccak256("paused"),
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 7 days)
        );
    }

    function test_PauseBlocksVerification()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(owner);
        manager.pause();

        vm.prank(verifier);
        vm.expectRevert();

        manager.completeCommitment(
            id,
            5e6
        );
    }

    function test_PauseBlocksRewardClaim()
        public
    {
        (
            uint256 id,
        ) =
            _createAliceCommitment();

        vm.prank(verifier);

        manager.completeCommitment(
            id,
            5e6
        );

        vm.prank(owner);
        manager.pause();

        vm.prank(alice);
        vm.expectRevert();

        manager.claimReward(id);
    }
}