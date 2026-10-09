// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

contract KeptSavingsVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    uint16 public constant PROFIT_FEE_BPS = 1_000;
    uint16 public constant DEPOSIT_FEE_BPS = 20;

    uint256 internal constant VIRTUAL_SHARES = 1e6;

    error MintDisabled();
    error ShareTransfersDisabled();
    error StrategyNotBound();
    error StrategyAlreadyBound();
    error InvalidAsset();
    error InvalidStrategy();
    error StrategyAssetMismatch();
    error StrategyVaultMismatch();
    error InvalidFeeConfiguration();
    error InsufficientStrategyLiquidity(uint256 requested, uint256 available);
    error ZeroAssets();
    error ZeroShares();

    event StrategyBound(address indexed strategy);
    event YieldFeeCrystallized(uint256 feeAssets, uint256 feeShares, uint256 highWaterMarkAssets);
    event DepositFeeSharesMinted(address indexed receiver, uint256 assets, uint256 feeShares);

    IYieldStrategy public strategy;
    address public immutable feeRecipient;
    uint256 public highWaterMarkAssets;

    constructor(IERC20 asset_, address initialOwner, address feeRecipient_)
        ERC20("Kept Savings USDC", "ksUSDC")
        ERC4626(asset_)
        Ownable(initialOwner)
    {
        if (
            address(asset_) == address(0) || address(asset_).code.length == 0
                || IERC20Metadata(address(asset_)).decimals() != 6
        ) {
            revert InvalidAsset();
        }

        if (feeRecipient_ == address(0)) {
            revert InvalidFeeConfiguration();
        }

        feeRecipient = feeRecipient_;
    }

    function bindStrategy(address strategy_) external onlyOwner {
        if (address(strategy) != address(0)) {
            revert StrategyAlreadyBound();
        }

        if (strategy_ == address(0) || strategy_.code.length == 0 || totalSupply() != 0) {
            revert InvalidStrategy();
        }

        IYieldStrategy candidate = IYieldStrategy(strategy_);

        if (candidate.asset() != asset()) {
            revert StrategyAssetMismatch();
        }

        if (candidate.vault() != address(this)) {
            revert StrategyVaultMismatch();
        }

        strategy = candidate;

        emit StrategyBound(strategy_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256 shares) {
        _requireInflowsAllowed(assets);
        _crystallizeYieldFee();
        uint256 assetsBeforeDeposit = totalAssets();
        shares = super.deposit(assets, receiver);
        _checkpointAfterDeposit(assetsBeforeDeposit);
    }

    function mint(uint256, address) public pure override returns (uint256) {
        revert MintDisabled();
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        _crystallizeYieldFee();
        uint256 supplyBefore = totalSupply();
        shares = super.withdraw(assets, receiver, owner_);
        _checkpointAfterWithdrawal(supplyBefore);
    }

    function redeem(uint256 shares, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        _crystallizeYieldFee();
        uint256 supplyBefore = totalSupply();
        assets = super.redeem(shares, receiver, owner_);
        _checkpointAfterWithdrawal(supplyBefore);
    }

    function crystallizeYieldFee() external nonReentrant returns (uint256 feeAssets, uint256 feeShares) {
        return _crystallizeYieldFee();
    }

    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        IYieldStrategy bound = strategy;
        return address(bound) == address(0) ? idle : idle + bound.totalAssets();
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
        return _convertToSharesAfterPendingFee(assets, Math.Rounding.Floor);
    }

    function convertToAssets(uint256 shares) public view override returns (uint256) {
        return _convertToAssetsAfterPendingFee(shares, Math.Rounding.Floor);
    }

    function previewDeposit(uint256 assets) public view override returns (uint256) {
        uint256 grossShares = _convertToSharesAfterPendingFee(assets, Math.Rounding.Floor);

        uint256 feeShares = Math.mulDiv(grossShares, DEPOSIT_FEE_BPS, BPS_DENOMINATOR + DEPOSIT_FEE_BPS, Math.Rounding.Floor);

        return grossShares - feeShares;
    }

    function previewMint(uint256 shares) public view override returns (uint256) {
        return _convertToAssetsAfterPendingFee(shares, Math.Rounding.Ceil);
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        return _convertToSharesAfterPendingFee(assets, Math.Rounding.Ceil);
    }

    function previewRedeem(uint256 shares) public view override returns (uint256) {
        return _convertToAssetsAfterPendingFee(shares, Math.Rounding.Floor);
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        if (paused() || address(strategy) == address(0)) return 0;
        return super.maxDeposit(receiver);
    }

    function maxMint(address) public pure override returns (uint256) {
        return 0;
    }

    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 ownedAssets = _convertToAssetsAfterPendingFee(_sharesAvailableToOwner(owner_), Math.Rounding.Floor);
        uint256 liquid = _liquidAssets();
        return ownedAssets < liquid ? ownedAssets : liquid;
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 ownedShares = _sharesAvailableToOwner(owner_);
        uint256 liquid = _liquidAssets();
        if (liquid >= totalAssets()) return ownedShares;
        uint256 liquidShares = _convertToSharesAfterPendingFee(liquid + 1, Math.Rounding.Ceil) - 1;
        return ownedShares < liquidShares ? ownedShares : liquidShares;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _requireInflowsAllowed(assets);

        if (shares == 0) revert ZeroShares();

        // Gross entitlement includes a fee applied to the net amount saved.
        uint256 grossShares = _convertToSharesAfterPendingFee(assets, Math.Rounding.Floor);

        uint256 feeShares = grossShares - shares;

        // Transfers ALL assets into the vault and
        // mints the net shares to the user.
        super._deposit(caller, receiver, assets, shares);

        // Kept receives fee shares without removing assets.
        if (feeShares != 0) {
            _mint(feeRecipient, feeShares);

            emit DepositFeeSharesMinted(receiver, assets, feeShares);
        }

        // All deposited USDC remains productive.
        IYieldStrategy bound = strategy;

        IERC20(asset()).safeTransfer(address(bound), assets);

        uint256 deposited = bound.deposit(assets);

        if (deposited != assets) {
            revert InsufficientStrategyLiquidity(assets, deposited);
        }
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle < assets) {
            uint256 shortfall = assets - idle;
            uint256 available = strategy.availableLiquidity();
            if (shortfall > available) revert InsufficientStrategyLiquidity(shortfall, available);
            uint256 withdrawn = strategy.withdraw(shortfall);
            if (withdrawn != shortfall) revert InsufficientStrategyLiquidity(shortfall, withdrawn);
        }
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            revert ShareTransfersDisabled();
        }

        super._update(from, to, value);
    }

    function _requireInflowsAllowed(uint256 assets) internal view {
        if (address(strategy) == address(0)) revert StrategyNotBound();
        _requireNotPaused();
        if (assets == 0) revert ZeroAssets();
    }

    function _liquidAssets() internal view returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        IYieldStrategy bound = strategy;
        return address(bound) == address(0) ? idle : idle + bound.availableLiquidity();
    }

    function _crystallizeYieldFee() internal returns (uint256 feeAssets, uint256 feeShares) {
        uint256 supply = totalSupply();

        if (supply == 0) {
            highWaterMarkAssets = 0;
            return (0, 0);
        }

        uint256 assets = totalAssets();

        if (assets <= highWaterMarkAssets) {
            return (0, 0);
        }

        uint256 profit = assets - highWaterMarkAssets;

        feeAssets = Math.mulDiv(profit, PROFIT_FEE_BPS, BPS_DENOMINATOR, Math.Rounding.Floor);

        if (feeAssets == 0) {
            return (0, 0);
        }

        feeShares = Math.mulDiv(feeAssets, supply + VIRTUAL_SHARES, assets + 1 - feeAssets, Math.Rounding.Floor);

        if (feeShares == 0) {
            return (0, 0);
        }

        _mint(feeRecipient, feeShares);

        highWaterMarkAssets = assets;

        emit YieldFeeCrystallized(feeAssets, feeShares, highWaterMarkAssets);
    }

    function _checkpointAfterDeposit(uint256 assetsBeforeDeposit) internal {
        uint256 assetsAfterDeposit = totalAssets();

        uint256 creditedAssets = assetsAfterDeposit > assetsBeforeDeposit ? assetsAfterDeposit - assetsBeforeDeposit : 0;

        if (assetsBeforeDeposit > highWaterMarkAssets) {
            highWaterMarkAssets = assetsBeforeDeposit;
        }

        highWaterMarkAssets += creditedAssets;
    }

    function _previewPendingFeeShares() internal view returns (uint256 feeShares) {
        uint256 supply = totalSupply();

        if (supply == 0) {
            return 0;
        }

        uint256 assets = totalAssets();

        if (assets <= highWaterMarkAssets) {
            return 0;
        }

        uint256 profit = assets - highWaterMarkAssets;

        uint256 feeAssets = Math.mulDiv(profit, PROFIT_FEE_BPS, BPS_DENOMINATOR, Math.Rounding.Floor);

        if (feeAssets == 0) {
            return 0;
        }

        return Math.mulDiv(feeAssets, supply + VIRTUAL_SHARES, assets + 1 - feeAssets, Math.Rounding.Floor);
    }

    function _sharesAvailableToOwner(address owner_) internal view returns (uint256) {
        uint256 shares = balanceOf(owner_);
        return owner_ == feeRecipient ? shares + _previewPendingFeeShares() : shares;
    }

    function _convertToSharesAfterPendingFee(uint256 assets, Math.Rounding rounding) internal view returns (uint256) {
        return
            Math.mulDiv(
                assets, totalSupply() + _previewPendingFeeShares() + VIRTUAL_SHARES, totalAssets() + 1, rounding
            );
    }

    function _convertToAssetsAfterPendingFee(uint256 shares, Math.Rounding rounding) internal view returns (uint256) {
        return
            Math.mulDiv(
                shares, totalAssets() + 1, totalSupply() + _previewPendingFeeShares() + VIRTUAL_SHARES, rounding
            );
    }

    function _checkpointAfterWithdrawal(uint256 supplyBefore) internal {
        uint256 supplyAfter = totalSupply();

        if (supplyAfter == 0) {
            highWaterMarkAssets = 0;
            return;
        }

        highWaterMarkAssets = Math.mulDiv(highWaterMarkAssets, supplyAfter, supplyBefore, Math.Rounding.Ceil);
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }
}
