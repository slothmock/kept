// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {IAavePool, IAaveAToken} from "../src/interfaces/IAave.sol";

/// @notice Read-only-on-mainnet preflight. All deployments occur on a local fork.
contract MonadMainnetPreflightTest is Test {
    uint256 internal constant MONAD_CHAIN_ID = 143;
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant AAVE_POOL = 0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef;
    address internal constant A_USDC = 0x35a73BAcb179d3740395A3ceCc87FF2e581d6042;

    function testMainnetAaveReserveAndStrategyConstruction() public {
        vm.createSelectFork(vm.envString("MONAD_MAINNET_RPC_URL"));
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
    }
}
