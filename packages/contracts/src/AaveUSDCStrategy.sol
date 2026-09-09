// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";
import {IAavePool, IAaveAToken} from "./interfaces/IAave.sol";

contract AaveUSDCStrategy is IYieldStrategy {
    using SafeERC20 for IERC20;

    error UnauthorizedVaultCaller(address caller);
    error InvalidVault();
    error InvalidAsset();
    error InvalidAavePool();
    error InvalidAToken();
    error ATokenAssetMismatch();
    error ZeroAssets();
    error InsufficientAaveLiquidity(uint256 requested, uint256 available);
    error UnexpectedWithdrawAmount(uint256 requested, uint256 received);

    event StrategyDeposit(uint256 assets);
    event StrategyWithdrawal(uint256 assets);

    address public immutable vault;
    address public immutable override asset;
    IAavePool public immutable aavePool;
    IAaveAToken public immutable aToken;

    modifier onlyVault() {
        if (msg.sender != vault) revert UnauthorizedVaultCaller(msg.sender);
        _;
    }

    constructor(address vault_, address asset_, address aavePool_, address aToken_) {
        if (vault_ == address(0)) revert InvalidVault();
        if (asset_ == address(0) || asset_.code.length == 0 || IERC20Metadata(asset_).decimals() != 6) {
            revert InvalidAsset();
        }
        if (aavePool_ == address(0) || aavePool_.code.length == 0) revert InvalidAavePool();
        if (aToken_ == address(0) || aToken_.code.length == 0) revert InvalidAToken();
        if (IAaveAToken(aToken_).UNDERLYING_ASSET_ADDRESS() != asset_) revert ATokenAssetMismatch();

        vault = vault_;
        asset = asset_;
        aavePool = IAavePool(aavePool_);
        aToken = IAaveAToken(aToken_);
        IERC20(asset_).forceApprove(aavePool_, type(uint256).max);
    }

    function deposit(uint256 assets) external onlyVault returns (uint256 deposited) {
        if (assets == 0) revert ZeroAssets();
        uint256 idleBefore = IERC20(asset).balanceOf(address(this));
        if (idleBefore < assets) revert UnexpectedWithdrawAmount(assets, idleBefore);
        aavePool.supply(asset, assets, address(this), 0);
        uint256 idleAfter = IERC20(asset).balanceOf(address(this));
        if (idleBefore - idleAfter != assets) revert UnexpectedWithdrawAmount(assets, idleBefore - idleAfter);
        emit StrategyDeposit(assets);
        return assets;
    }

    function withdraw(uint256 assets) external onlyVault returns (uint256 withdrawn) {
        if (assets == 0) revert ZeroAssets();
        uint256 available = availableLiquidity();
        if (assets > available) revert InsufficientAaveLiquidity(assets, available);

        IERC20 token = IERC20(asset);
        uint256 idle = token.balanceOf(address(this));
        if (idle < assets) {
            uint256 shortfall = assets - idle;
            uint256 balanceBefore = idle;
            uint256 received = aavePool.withdraw(asset, shortfall, address(this));
            uint256 balanceIncrease = token.balanceOf(address(this)) - balanceBefore;
            if (received != shortfall || balanceIncrease != shortfall) {
                revert UnexpectedWithdrawAmount(shortfall, received);
            }
        }

        token.safeTransfer(vault, assets);
        emit StrategyWithdrawal(assets);
        return assets;
    }

    function totalAssets() public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this)) + aToken.balanceOf(address(this));
    }

    function availableLiquidity() public view returns (uint256) {
        uint256 idle = IERC20(asset).balanceOf(address(this));
        uint256 position = aToken.balanceOf(address(this));
        uint256 reserveCash = IERC20(asset).balanceOf(address(aToken));
        return idle + (position < reserveCash ? position : reserveCash);
    }
}
