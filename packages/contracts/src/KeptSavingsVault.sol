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
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

contract KeptSavingsVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    uint64 public constant AUTOMATIC_DEPOSIT_INTERVAL = 7 days;

    error StrategyNotBound();
    error StrategyAlreadyBound();
    error InvalidAsset();
    error InvalidStrategy();
    error StrategyAssetMismatch();
    error StrategyVaultMismatch();
    error AutomaticDepositTooSoon(uint64 nextEligibleAt);
    error InsufficientStrategyLiquidity(uint256 requested, uint256 available);
    error ZeroAssets();
    error ZeroShares();

    event StrategyBound(address indexed strategy);
    event AutomaticDeposit(address indexed account, uint256 assets, uint256 shares, uint64 nextEligibleAt);

    IYieldStrategy public strategy;
    mapping(address account => uint64 timestamp) public lastAutomaticDepositAt;

    constructor(IERC20 asset_, address initialOwner)
        ERC20("Kept Savings USDC", "ksUSDC")
        ERC4626(asset_)
        Ownable(initialOwner)
    {
        if (
            address(asset_) == address(0) || address(asset_).code.length == 0
                || IERC20Metadata(address(asset_)).decimals() != 6
        ) revert InvalidAsset();
    }

    function bindStrategy(address strategy_) external onlyOwner {
        if (address(strategy) != address(0)) revert StrategyAlreadyBound();
        if (strategy_ == address(0) || strategy_.code.length == 0 || totalSupply() != 0) revert InvalidStrategy();
        if (IYieldStrategy(strategy_).asset() != asset()) revert StrategyAssetMismatch();
        (bool ok, bytes memory result) = strategy_.staticcall(abi.encodeWithSignature("vault()"));
        if (!ok || result.length < 32 || abi.decode(result, (address)) != address(this)) {
            revert StrategyVaultMismatch();
        }
        strategy = IYieldStrategy(strategy_);
        emit StrategyBound(strategy_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function depositAutomatically(uint256 assets) external nonReentrant returns (uint256 shares) {
        _requireInflowsAllowed(assets);
        uint64 previous = lastAutomaticDepositAt[msg.sender];
        if (previous != 0) {
            uint64 nextEligibleAt = previous + AUTOMATIC_DEPOSIT_INTERVAL;
            if (block.timestamp < nextEligibleAt) revert AutomaticDepositTooSoon(nextEligibleAt);
        }

        shares = previewDeposit(assets);
        _deposit(msg.sender, msg.sender, assets, shares);
        uint64 depositedAt = block.timestamp.toUint64();
        lastAutomaticDepositAt[msg.sender] = depositedAt;
        emit AutomaticDeposit(msg.sender, assets, shares, depositedAt + AUTOMATIC_DEPOSIT_INTERVAL);
    }

    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256 shares) {
        _requireInflowsAllowed(assets);
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256 assets) {
        if (address(strategy) == address(0)) revert StrategyNotBound();
        _requireNotPaused();
        if (shares == 0) revert ZeroAssets();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        return super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        return super.redeem(shares, receiver, owner_);
    }

    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        IYieldStrategy bound = strategy;
        return address(bound) == address(0) ? idle : idle + bound.totalAssets();
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        if (paused() || address(strategy) == address(0)) return 0;
        return super.maxDeposit(receiver);
    }

    function maxMint(address receiver) public view override returns (uint256) {
        if (paused() || address(strategy) == address(0)) return 0;
        return super.maxMint(receiver);
    }

    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 ownedAssets = previewRedeem(balanceOf(owner_));
        uint256 liquid = _liquidAssets();
        return ownedAssets < liquid ? ownedAssets : liquid;
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 ownedShares = balanceOf(owner_);
        uint256 liquid = _liquidAssets();
        if (liquid >= totalAssets()) return ownedShares;
        uint256 liquidShares = _convertToShares(liquid + 1, Math.Rounding.Ceil) - 1;
        return ownedShares < liquidShares ? ownedShares : liquidShares;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _requireInflowsAllowed(assets);
        if (shares == 0) revert ZeroShares();
        super._deposit(caller, receiver, assets, shares);
        IYieldStrategy bound = strategy;
        IERC20(asset()).safeTransfer(address(bound), assets);
        // All public inflow entry points are nonReentrant; automatic cadence is written only after this succeeds.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        uint256 deposited = bound.deposit(assets);
        if (deposited != assets) revert InsufficientStrategyLiquidity(assets, deposited);
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

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }
}
