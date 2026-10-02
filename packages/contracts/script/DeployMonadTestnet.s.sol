// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StagingUSDC} from "../src/StagingUSDC.sol";
import {StagingYieldStrategy} from "../src/StagingYieldStrategy.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {KeptTreasury} from "../src/KeptTreasury.sol";
import {CommitmentManager} from "../src/CommitmentManager.sol";
import {IKeptTreasury} from "../src/interfaces/IKeptTreasury.sol";

/// @notice Deploys the Kept staging stack to Monad testnet.
/// @dev Deliberately does not use Aave. Production Aave deployment remains
/// isolated to Monad mainnet.
contract DeployMonadTestnet is Script {
    error UnsupportedTestnetChain(uint256 chainId);
    error OwnerVerifierCollision();

    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10143;

    function assertTestnetChain() public view {
        if (block.chainid != MONAD_TESTNET_CHAIN_ID) {
            revert UnsupportedTestnetChain(block.chainid);
        }
    }

    function run()
        external
        returns (
            StagingUSDC usdc,
            KeptTreasury treasury,
            KeptSavingsVault vault,
            StagingYieldStrategy strategy,
            CommitmentManager commitmentManager
        )
    {
        assertTestnetChain();

        uint256 deployerPrivateKey =
            vm.envUint("TESTNET_DEPLOYER_PRIVATE_KEY");

        address owner = vm.addr(deployerPrivateKey);

        address verifier =
            vm.envAddress("TESTNET_COMMITMENT_VERIFIER");

        if (owner == verifier) {
            revert OwnerVerifierCollision();
        }

        vm.startBroadcast(deployerPrivateKey);

        usdc = new StagingUSDC(owner);

        treasury =
            new KeptTreasury(
                IERC20(address(usdc)),
                owner
            );

        vault =
            new KeptSavingsVault(
                IERC20(address(usdc)),
                owner,
                address(treasury)
            );

        treasury.bindVault(address(vault));

        strategy =
            new StagingYieldStrategy(
                address(vault),
                address(usdc),
                owner
            );

        vault.bindStrategy(address(strategy));

        commitmentManager =
            new CommitmentManager(
                IKeptTreasury(address(treasury)),
                owner,
                verifier
            );

        treasury.setRewardManager(address(commitmentManager));

        vm.stopBroadcast();

        console2.log("TESTNET_OWNER", owner);
        console2.log("TESTNET_COMMITMENT_VERIFIER", verifier);
        console2.log("TESTNET_USDC", address(usdc));
        console2.log("TESTNET_KEPT_TREASURY", address(treasury));
        console2.log("TESTNET_KEPT_VAULT", address(vault));
        console2.log("TESTNET_KEPT_STRATEGY", address(strategy));
        console2.log("TESTNET_COMMITMENT_MANAGER", address(commitmentManager));
    }
}
