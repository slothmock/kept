// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {IAavePool, IAaveAToken} from "../src/interfaces/IAave.sol";
import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";

interface IPoolAddressesProviderView {
    function getPool() external view returns (address);
}

contract MonadAaveForkTest is Test {
    uint256 internal constant MONAD_CHAIN_ID = 143;
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant POOL_ADDRESSES_PROVIDER = 0x34793Fb9935F7bB5E5aE920fb963F39063E7A615;
    address internal constant POOL = 0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef;
    address internal constant A_USDC = 0x35a73BAcb179d3740395A3ceCc87FF2e581d6042;

    function testFork_MonadUSDCVaultAaveSupplyAndWithdrawal() public {
        string memory rpc = vm.envOr("MONAD_RPC_URL", string(""));
        vm.skip(bytes(rpc).length == 0, "MONAD_RPC_URL is required for the Monad Aave fork profile");
        vm.createSelectFork(rpc);

        _assertProtocolConfiguration();

        (KeptSavingsVault vault, AaveUSDCStrategy strategy, address feeRecipient) = _deployVault();
        uint256 amount = _deposit(vault, strategy);
        uint256 grossAssets = _assertYieldAccrual(vault, amount);
        _crystallizeYieldFee(vault, feeRecipient);
        _redeemAll(vault, strategy, feeRecipient, grossAssets);
    }

    function _assertProtocolConfiguration() internal view {
        assertEq(block.chainid, MONAD_CHAIN_ID);
        assertGt(USDC.code.length, 0);
        assertGt(POOL.code.length, 0);
        assertGt(A_USDC.code.length, 0);
        assertEq(IERC20Metadata(USDC).decimals(), 6);
        assertEq(IPoolAddressesProviderView(POOL_ADDRESSES_PROVIDER).getPool(), POOL);
        assertEq(IAaveAToken(A_USDC).UNDERLYING_ASSET_ADDRESS(), USDC);
        assertEq(IAavePool(POOL).getReserveAToken(USDC), A_USDC);
    }

    function _deployVault() internal returns (KeptSavingsVault vault, AaveUSDCStrategy strategy, address feeRecipient) {
        feeRecipient = makeAddr("monadFeeRecipient");
        vault = new KeptSavingsVault(IERC20(USDC), address(this), feeRecipient);
        strategy = new AaveUSDCStrategy(address(vault), USDC, POOL, A_USDC);
        vault.bindStrategy(address(strategy));
    }

    function _deposit(KeptSavingsVault vault, AaveUSDCStrategy strategy) internal returns (uint256 amount) {
        amount = 10e6;
        deal(USDC, address(this), amount, true);
        IERC20(USDC).approve(address(vault), amount);
        uint256 reserveCashBefore = IERC20(USDC).balanceOf(A_USDC);
        uint256 shares = vault.deposit(amount, address(this));
        assertGt(shares, 0);
        assertEq(IERC20(USDC).balanceOf(A_USDC) - reserveCashBefore, amount);
        assertApproxEqAbs(IERC20(A_USDC).balanceOf(address(strategy)), amount, 1);
    }

    function _assertYieldAccrual(KeptSavingsVault vault, uint256 amount) internal returns (uint256 grossAssets) {
        uint256 userSharesBefore = vault.balanceOf(address(this));
        uint256 userAssetsBefore = vault.convertToAssets(userSharesBefore);
        vm.warp(block.timestamp + 365 days);
        uint256 userSharesAfter = vault.balanceOf(address(this));
        uint256 userAssetsAfter = vault.convertToAssets(userSharesAfter);
        assertEq(userSharesAfter, userSharesBefore);
        assertGt(userAssetsAfter, userAssetsBefore);
        grossAssets = vault.totalAssets();
        assertGt(grossAssets, amount);
    }

    function _crystallizeYieldFee(KeptSavingsVault vault, address feeRecipient) internal {
        (uint256 feeAssets, uint256 feeShares) = vault.crystallizeYieldFee();
        assertGt(feeAssets, 0);
        assertGt(feeShares, 0);
        assertEq(vault.balanceOf(feeRecipient), feeShares);
    }

    function _redeemAll(KeptSavingsVault vault, AaveUSDCStrategy strategy, address feeRecipient, uint256 grossAssets)
        internal
    {
        vault.withdraw(4e6, address(this), address(this));
        assertEq(IERC20(USDC).balanceOf(address(this)), 4e6);
        vault.redeem(vault.balanceOf(address(this)), address(this), address(this));
        uint256 feeRecipientShares = vault.balanceOf(feeRecipient);
        vm.prank(feeRecipient);
        vault.redeem(feeRecipientShares, feeRecipient, feeRecipient);
        assertApproxEqAbs(IERC20(USDC).balanceOf(address(this)) + IERC20(USDC).balanceOf(feeRecipient), grossAssets, 10);

        assertEq(vault.balanceOf(address(this)), 0);
        assertEq(vault.balanceOf(feeRecipient), 0);
        assertApproxEqAbs(strategy.totalAssets(), 0, 1);
        assertApproxEqAbs(IERC20(A_USDC).balanceOf(address(strategy)), 0, 1);
    }
}
