// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeployMonadTestnet} from "../script/DeployMonadTestnet.s.sol";

contract DeployMonadTestnetTest is Test {
    function test_AcceptsMonadTestnet() public {
        DeployMonadTestnet deployment = new DeployMonadTestnet();

        vm.chainId(10143);

        deployment.assertTestnetChain();
    }

    function test_RejectsNonTestnetChain() public {
        DeployMonadTestnet deployment = new DeployMonadTestnet();

        vm.chainId(143);

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployMonadTestnet.UnsupportedTestnetChain.selector,
                143
            )
        );

        deployment.assertTestnetChain();
    }
}
