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

        address demoOwner = makeAddr("demoOwner");
        address demoFeeRecipient = makeAddr("demoFeeRecipient");
        KeptSavingsVault vault = new KeptSavingsVault(IERC20(USDC), demoOwner, demoFeeRecipient);
        AaveUSDCStrategy strategy = new AaveUSDCStrategy(
            address(vault), USDC, AAVE_POOL, A_USDC
        );
        vm.prank(demoOwner);
        vault.bindStrategy(address(strategy));

        assertEq(address(vault.strategy()), address(strategy));
        assertEq(strategy.asset(), USDC);
        assertEq(vault.maxDeposit(demoOwner) > 0, true);

        // Exercise the real Aave pool on the fork. No mainnet broadcast.
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

        KeptTreasury treasury = new KeptTreasury(IERC20(USDC), demoOwner);
        KeptSavingsVault rewardVault = new KeptSavingsVault(IERC20(USDC), demoOwner, address(treasury));
        vm.prank(demoOwner);
        treasury.bindVault(address(rewardVault));
        address verifier = makeAddr("verifier");
        CommitmentManager manager = new CommitmentManager(
            IKeptTreasury(address(treasury)), demoOwner, verifier
        );
        vm.prank(demoOwner);
        treasury.setRewardManager(address(manager));

        address participant = makeAddr("participant");
        bytes32 referenceId = keccak256("fork-mainnet-reward");
        uint64 startAt = uint64(block.timestamp + 1);
        uint64 endAt = startAt + 1;
        vm.prank(participant);
        uint256 commitmentId = manager.createCommitment(referenceId, startAt, endAt);
        vm.warp(endAt);
        // Prefund before verification, because completion reserves the obligation.
        deal(USDC, address(treasury), 5e6);
        vm.prank(verifier);
        manager.completeCommitment(commitmentId, 5e6);

        // Prefund the reward explicitly; no real mainnet funds are transferred.
        uint256 beforeBalance = IERC20(USDC).balanceOf(participant);
        vm.prank(participant);
        manager.claimReward(commitmentId);
        assertEq(IERC20(USDC).balanceOf(participant) - beforeBalance, 5e6);
        assertEq(IERC20(USDC).balanceOf(address(treasury)), 0);
    }
}
