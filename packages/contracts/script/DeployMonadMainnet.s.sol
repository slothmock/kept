// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAavePool, IAaveAToken} from "../src/interfaces/IAave.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {KeptTreasury} from "../src/KeptTreasury.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {CommitmentManager} from "../src/CommitmentManager.sol";
import {IKeptTreasury} from "../src/interfaces/IKeptTreasury.sol";

/// @notice Deploy Kept's Monad mainnet savings infrastructure.
/// @dev Forge must also be invoked with --broadcast to submit transactions.
contract DeployMonadMainnet is Script {
    error WrongChain(uint256 actual);
    error NotExplicitlyEnabled();
    error InvalidOwner();
    error AaveReserveMismatch();
    error InvalidVerifier();

    uint256 internal constant MONAD_CHAIN_ID = 143;
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant AAVE_POOL = 0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef;
    address internal constant A_USDC = 0x35a73BAcb179d3740395A3ceCc87FF2e581d6042;

    function run()
        external
        returns (KeptTreasury treasury, KeptSavingsVault vault, AaveUSDCStrategy strategy, CommitmentManager manager)
    {
        if (block.chainid != MONAD_CHAIN_ID) revert WrongChain(block.chainid);
        if (!vm.envOr("ENABLE_MONAD_MAINNET_DEPLOY", false)) revert NotExplicitlyEnabled();

        address owner = vm.envAddress("MAINNET_OWNER");
        // The deploying signer must also own both contracts to bind them.
        uint256 signerKey = vm.envUint("MAINNET_DEPLOYER_PRIVATE_KEY");
        if (signerKey == 0) revert InvalidOwner();
        address deployer = vm.addr(signerKey);
        if (owner == address(0) || owner != deployer) revert InvalidOwner();
        address verifier = vm.envAddress("MAINNET_COMMITMENT_VERIFIER");
        if (verifier == address(0) || verifier == owner) revert InvalidVerifier();
        if (
            IAavePool(AAVE_POOL).getReserveAToken(USDC) != A_USDC
                || IAaveAToken(A_USDC).UNDERLYING_ASSET_ADDRESS() != USDC
        ) revert AaveReserveMismatch();

        // Explicitly broadcast with the signer whose address passed validation.
        vm.startBroadcast(signerKey);
        treasury = new KeptTreasury(IERC20(USDC), owner);
        vault = new KeptSavingsVault(IERC20(USDC), owner, address(treasury));
        treasury.bindVault(address(vault));
        strategy = new AaveUSDCStrategy(address(vault), USDC, AAVE_POOL, A_USDC);
        vault.bindStrategy(address(strategy));
        manager = new CommitmentManager(IKeptTreasury(address(treasury)), owner, verifier);
        treasury.setRewardManager(address(manager));
        vm.stopBroadcast();

        console2.log("MAINNET_TREASURY", address(treasury));
        console2.log("MAINNET_VAULT", address(vault));
        console2.log("MAINNET_STRATEGY", address(strategy));
        console2.log("MAINNET_COMMITMENT_MANAGER", address(manager));
    }
}
