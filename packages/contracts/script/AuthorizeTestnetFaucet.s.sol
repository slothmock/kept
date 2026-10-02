// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {StagingUSDC} from "../src/StagingUSDC.sol";

contract AuthorizeTestnetFaucet is Script {
    error UnsupportedTestnetChain(uint256 chainId);

    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10143;

    function run() external {
        if (block.chainid != MONAD_TESTNET_CHAIN_ID) {
            revert UnsupportedTestnetChain(block.chainid);
        }

        address usdc =
            vm.envAddress("TESTNET_USDC");

        address faucetMinter =
            vm.envAddress("TESTNET_FAUCET_MINTER");

        // Signing is provided externally by Forge using the testnet owner
        // keystore. No private key is read by this script.
        vm.startBroadcast();

        StagingUSDC(usdc)
            .setMinter(
                faucetMinter,
                true
            );

        vm.stopBroadcast();

        console2.log(
            "TESTNET_USDC",
            usdc
        );

        console2.log(
            "TESTNET_FAUCET_MINTER",
            faucetMinter
        );

        console2.log(
            "AUTHORIZED",
            StagingUSDC(usdc)
                .minters(
                    faucetMinter
                )
        );
    }
}
