// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeployLocalVault} from "../script/DeployLocalVault.s.sol";

contract DeployLocalVaultTest is Test {
    function test_RejectsNonAnvilChainBeforeLocalDeployment() public {
        DeployLocalVault deployment = new DeployLocalVault();
        vm.chainId(143);

        vm.expectRevert(abi.encodeWithSelector(DeployLocalVault.UnsupportedLocalChain.selector, 143));
        deployment.assertLocalChain();
    }
}
