// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

/// @notice Testnet-only strategy used to exercise Kept's savings flow
/// without depending on a production lending market.
/// @dev Holds the staging asset directly. The owner may inject test yield
/// with fundYield(), which increases vault totalAssets() like external yield.
contract StagingYieldStrategy is IYieldStrategy, Ownable {
    using SafeERC20 for IERC20;

    error UnsupportedChain(uint256 chainId);
    error UnauthorizedVaultCaller(address caller);
    error InvalidVault();
    error InvalidAsset();
    error ZeroAssets();
    error InsufficientAssets(uint256 requested, uint256 available);

    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10143;
    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    address public immutable override vault;
    address public immutable override asset;

    event StrategyDeposit(uint256 assets);
    event StrategyWithdrawal(uint256 assets);
    event YieldFunded(address indexed funder, uint256 assets);

    modifier onlyVault() {
        if (msg.sender != vault) {
            revert UnauthorizedVaultCaller(msg.sender);
        }
        _;
    }

    constructor(address vault_, address asset_, address initialOwner)
        Ownable(initialOwner)
    {
        if (
            block.chainid != MONAD_TESTNET_CHAIN_ID
                && block.chainid != ANVIL_CHAIN_ID
        ) {
            revert UnsupportedChain(block.chainid);
        }

        if (vault_ == address(0)) {
            revert InvalidVault();
        }

        if (
            asset_ == address(0)
                || asset_.code.length == 0
                || IERC20Metadata(asset_).decimals() != 6
        ) {
            revert InvalidAsset();
        }

        vault = vault_;
        asset = asset_;
    }

    function deposit(uint256 assets)
        external
        onlyVault
        returns (uint256 deposited)
    {
        if (assets == 0) {
            revert ZeroAssets();
        }

        uint256 available = IERC20(asset).balanceOf(address(this));

        if (available < assets) {
            revert InsufficientAssets(assets, available);
        }

        emit StrategyDeposit(assets);

        return assets;
    }

    function withdraw(uint256 assets)
        external
        onlyVault
        returns (uint256 withdrawn)
    {
        if (assets == 0) {
            revert ZeroAssets();
        }

        uint256 available = IERC20(asset).balanceOf(address(this));

        if (available < assets) {
            revert InsufficientAssets(assets, available);
        }

        IERC20(asset).safeTransfer(vault, assets);

        emit StrategyWithdrawal(assets);

        return assets;
    }

    function fundYield(uint256 assets) external onlyOwner {
        if (assets == 0) {
            revert ZeroAssets();
        }

        IERC20(asset).safeTransferFrom(msg.sender, address(this), assets);

        emit YieldFunded(msg.sender, assets);
    }

    function totalAssets() external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    function availableLiquidity() external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }
}
