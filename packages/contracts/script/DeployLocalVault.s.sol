// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {KeptTreasury} from "../src/KeptTreasury.sol";
import {CommitmentManager} from "../src/CommitmentManager.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {IKeptTreasury} from "../src/interfaces/IKeptTreasury.sol";

import {
    MockUSDC,
    MockAToken,
    MockAavePool
} from "../test/mocks/MockAave.sol";

/// @notice Local-only deployment for exercising the full Kept MVP stack.
/// @dev Uses Anvil mocks and must never be used for Monad deployment.
contract DeployLocalVault is Script {
    error UnsupportedLocalChain(uint256 chainId);
    error OwnerVerifierCollision();

    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    function assertLocalChain() public view {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert UnsupportedLocalChain(
                block.chainid
            );
        }
    }

    function run()
        external
        returns (
            MockUSDC usdc,
            MockAToken aToken,
            MockAavePool pool,
            KeptTreasury treasury,
            KeptSavingsVault vault,
            AaveUSDCStrategy strategy,
            CommitmentManager commitmentManager
        )
    {
        assertLocalChain();

        /*
         * Single source of truth for deployer + owner.
         */
        uint256 deployerPrivateKey =
            vm.envUint(
                "LOCAL_DEPLOYER_PRIVATE_KEY"
            );

        address owner =
            vm.addr(deployerPrivateKey);

        /*
         * The verifier does not deploy anything.
         * We only need its address here.
         */
        address verifier =
            vm.envAddress(
                "LOCAL_COMMITMENT_VERIFIER"
            );

        if (owner == verifier) {
            revert OwnerVerifierCollision();
        }

        console2.log(
            "LOCAL_DEPLOYER_OWNER",
            owner
        );

        console2.log(
            "LOCAL_COMMITMENT_VERIFIER",
            verifier
        );

        vm.startBroadcast(
            deployerPrivateKey
        );

        // -------------------------------------------------
        // Local infrastructure
        // -------------------------------------------------

        usdc =
            new MockUSDC();

        aToken =
            new MockAToken(
                address(usdc)
            );

        pool =
            new MockAavePool(
                usdc,
                aToken
            );

        // -------------------------------------------------
        // Kept Treasury
        // -------------------------------------------------

        treasury =
            new KeptTreasury(
                IERC20(address(usdc)),
                owner
            );

        // -------------------------------------------------
        // Kept Vault
        // -------------------------------------------------

        vault =
            new KeptSavingsVault(
                IERC20(address(usdc)),
                owner,
                address(treasury)
            );

        treasury.bindVault(
            address(vault)
        );

        // -------------------------------------------------
        // Yield Strategy
        // -------------------------------------------------

        strategy =
            new AaveUSDCStrategy(
                address(vault),
                address(usdc),
                address(pool),
                address(aToken)
            );

        vault.bindStrategy(
            address(strategy)
        );

        // -------------------------------------------------
        // Commitment verification
        // -------------------------------------------------

        commitmentManager =
            new CommitmentManager(
                IKeptTreasury(
                    address(treasury)
                ),
                owner,
                verifier
            );

        treasury.setRewardManager(
            address(commitmentManager)
        );

        vm.stopBroadcast();

        // -------------------------------------------------
        // Deployment output
        // -------------------------------------------------

        console2.log(
            "LOCAL_USDC",
            address(usdc)
        );

        console2.log(
            "LOCAL_AAVE_ATOKEN",
            address(aToken)
        );

        console2.log(
            "LOCAL_AAVE_POOL",
            address(pool)
        );

        console2.log(
            "LOCAL_KEPT_TREASURY",
            address(treasury)
        );

        console2.log(
            "LOCAL_KEPT_VAULT",
            address(vault)
        );

        console2.log(
            "LOCAL_KEPT_STRATEGY",
            address(strategy)
        );

        console2.log(
            "LOCAL_COMMITMENT_MANAGER",
            address(commitmentManager)
        );
    }
}