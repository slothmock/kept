// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {KeptTreasury} from "../src/KeptTreasury.sol";
import {CommitmentManager} from "../src/CommitmentManager.sol";
import {IKeptTreasury} from "../src/interfaces/IKeptTreasury.sol";
import {IAavePool, IAaveAToken} from "../src/interfaces/IAave.sol";

/// @notice Read-only-on-mainnet preflight. All deployments occur on a local fork.
contract MonadMainnetPreflightTest is Test {
    uint256 internal constant MONAD_CHAIN_ID = 143;
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant AAVE_POOL = 0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef;
    address internal constant A_USDC = 0x35a73BAcb179d3740395A3ceCc87FF2e581d6042;

    function testMainnetAaveReserveAndStrategyConstruction() public {
        string memory rpcUrl = vm.envOr("MONAD_MAINNET_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) return; // Explicit fork-only test.
        vm.createSelectFork(rpcUrl);
        assertEq(block.chainid, MONAD_CHAIN_ID);
        assertEq(IERC20(USDC).totalSupply() > 0, true);
        assertEq(IAavePool(AAVE_POOL).getReserveAToken(USDC), A_USDC);
        assertEq(IAaveAToken(A_USDC).UNDERLYING_ASSET_ADDRESS(), USDC);

        _testAaveDepositAndRedemption();
        _testRewardReservationAndClaim();
    }

    function _testAaveDepositAndRedemption() internal {
        address owner = makeAddr("demoOwner");
        KeptSavingsVault vault = new KeptSavingsVault(
            IERC20(USDC), owner, makeAddr("demoFeeRecipient")
        );
        AaveUSDCStrategy strategy = new AaveUSDCStrategy(
            address(vault), USDC, AAVE_POOL, A_USDC
        );
        vm.prank(owner);
        vault.bindStrategy(address(strategy));
        assertEq(address(vault.strategy()), address(strategy));
        assertEq(strategy.asset(), USDC);
        assertGt(vault.maxDeposit(owner), 0);

        address saver = makeAddr("demoSaver");
        deal(USDC, saver, 20e6);
        vm.startPrank(saver);
        IERC20(USDC).approve(address(vault), 10e6);
        uint256 shares = vault.deposit(10e6, saver);
        assertGt(shares, 0);
        assertGt(strategy.totalAssets(), 0);
        uint256 received = vault.redeem(shares, saver, saver);
        vm.stopPrank();
        assertGt(received, 0);
        assertEq(vault.balanceOf(saver), 0);
    }

    function _testRewardReservationAndClaim() internal {
        address owner = makeAddr("demoOwner");
        address verifier = makeAddr("verifier");
        address participant = makeAddr("participant");
        KeptTreasury treasury = new KeptTreasury(IERC20(USDC), owner);
        KeptSavingsVault vault = new KeptSavingsVault(
            IERC20(USDC), owner, address(treasury)
        );
        vm.prank(owner);
        treasury.bindVault(address(vault));
        CommitmentManager manager = new CommitmentManager(
            IKeptTreasury(address(treasury)), owner, verifier
        );
        vm.prank(owner);
        treasury.setRewardManager(address(manager));

        uint64 endAt = uint64(block.timestamp + 2);
        vm.prank(participant);
        uint256 commitmentId = manager.createCommitment(
            keccak256("fork-mainnet-reward"),
            uint64(block.timestamp + 1),
            endAt
        );
        vm.warp(endAt);
        deal(USDC, address(treasury), 5e6);
        vm.prank(verifier);
        manager.completeCommitment(commitmentId, 5e6);
        assertEq(treasury.totalReservedAssets(), 5e6);
        assertEq(treasury.availableRewardAssets(), 0);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(KeptTreasury.InsufficientTreasuryValue.selector, 1e6, 0)
        );
        treasury.withdrawAssets(owner, 1e6);

        uint256 balanceBefore = IERC20(USDC).balanceOf(participant);
        vm.prank(participant);
        manager.claimReward(commitmentId);
        assertEq(IERC20(USDC).balanceOf(participant) - balanceBefore, 5e6);
        assertEq(IERC20(USDC).balanceOf(address(treasury)), 0);
        assertEq(treasury.totalReservedAssets(), 0);
    }
}
