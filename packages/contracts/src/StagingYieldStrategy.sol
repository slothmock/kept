// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

interface IStagingMintableAsset {
    function mint(address to, uint256 amount) external;
}

/// @notice Testnet-only yield simulator for Kept staging.
/// @dev Yield is deterministic and time-based. Anyone may trigger accrual;
/// the amount is calculated onchain from elapsed time and the configured APY.
contract StagingYieldStrategy is IYieldStrategy {
    using SafeERC20 for IERC20;

    error UnsupportedChain(uint256 chainId);
    error UnauthorizedVaultCaller(address caller);
    error InvalidVault();
    error InvalidAsset();
    error InvalidAnnualYieldBps();
    error ZeroAssets();
    error InsufficientAssets(uint256 requested, uint256 available);

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant MAX_ANNUAL_YIELD_BPS = 10_000;

    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10143;
    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    address public immutable override vault;
    address public immutable override asset;
    uint256 public immutable annualYieldBps;

    uint256 public lastAccrualTimestamp;

    event StrategyDeposit(uint256 assets);
    event StrategyWithdrawal(uint256 assets);
    event YieldAccrued(uint256 assets, uint256 elapsedSeconds);

    modifier onlyVault() {
        if (msg.sender != vault) {
            revert UnauthorizedVaultCaller(msg.sender);
        }
        _;
    }

    constructor(
        address vault_,
        address asset_,
        uint256 annualYieldBps_
    ) {
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

        if (annualYieldBps_ > MAX_ANNUAL_YIELD_BPS) {
            revert InvalidAnnualYieldBps();
        }

        vault = vault_;
        asset = asset_;
        annualYieldBps = annualYieldBps_;
        lastAccrualTimestamp = block.timestamp;
    }

    function deposit(uint256 assets)
        external
        onlyVault
        returns (uint256 deposited)
    {
        if (assets == 0) {
            revert ZeroAssets();
        }

        uint256 balance = IERC20(asset).balanceOf(address(this));

        if (balance < assets) {
            revert InsufficientAssets(assets, balance);
        }

        // The vault transfers assets before calling deposit().
        // Accrue against the pre-deposit balance so new money does not
        // receive yield for time before it arrived.
        _accrueYield(balance - assets);
        lastAccrualTimestamp = block.timestamp;

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

        _accrueYield(IERC20(asset).balanceOf(address(this)));
        lastAccrualTimestamp = block.timestamp;

        uint256 available = IERC20(asset).balanceOf(address(this));

        if (available < assets) {
            revert InsufficientAssets(assets, available);
        }

        IERC20(asset).safeTransfer(vault, assets);

        emit StrategyWithdrawal(assets);

        return assets;
    }

    function previewAccruedYield() public view returns (uint256) {
        return _previewAccruedYield(
            IERC20(asset).balanceOf(address(this)),
            block.timestamp
        );
    }

    /// @notice Materialise staging yield accumulated since the last checkpoint.
    /// @dev Permissionless because callers cannot choose the amount.
    function accrueYield() external returns (uint256 accruedAssets) {
        return _accrueYield(IERC20(asset).balanceOf(address(this)));
    }

    function totalAssets() external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this)) + previewAccruedYield();
    }

    function availableLiquidity() external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this)) + previewAccruedYield();
    }

    function _accrueYield(uint256 baseAssets)
        internal
        returns (uint256 accruedAssets)
    {
        uint256 elapsed = block.timestamp - lastAccrualTimestamp;

        accruedAssets = _previewAccruedYield(baseAssets, block.timestamp);

        if (accruedAssets == 0) {
            return 0;
        }

        lastAccrualTimestamp = block.timestamp;

        IStagingMintableAsset(asset).mint(address(this), accruedAssets);

        emit YieldAccrued(accruedAssets, elapsed);
    }

    function _previewAccruedYield(
        uint256 baseAssets,
        uint256 timestamp
    ) internal view returns (uint256) {
        if (
            baseAssets == 0
                || annualYieldBps == 0
                || timestamp <= lastAccrualTimestamp
        ) {
            return 0;
        }

        uint256 elapsed = timestamp - lastAccrualTimestamp;

        return
            baseAssets
                * annualYieldBps
                * elapsed
                / BPS_DENOMINATOR
                / SECONDS_PER_YEAR;
    }
}
