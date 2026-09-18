// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {KeptSavingsVault} from "KeptSavingsVault.sol";

contract KeptTreasury is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Maximum reward payable for one verified commitment.
    /// @dev USDC uses 6 decimals, so 10e6 = 10 USDC.
    uint256 public constant MAX_REWARD = 10e6;

    IERC20 public immutable asset;

    KeptSavingsVault public vault;

    address public rewardManager;

    mapping(bytes32 rewardId => bool used) public rewardUsed;

    error InvalidAsset();
    error InvalidVault();
    error VaultAlreadyBound();
    error VaultAssetMismatch();
    error VaultFeeRecipientMismatch();

    error InvalidRewardManager();
    error UnauthorizedRewardManager(address caller);

    error InvalidRecipient();
    error InvalidRewardId();
    error RewardAlreadyUsed(bytes32 rewardId);

    error RewardTooLarge(uint256 requested, uint256 maximum);

    error ZeroAssets();

    error InsufficientTreasuryValue(uint256 requested, uint256 available);

    event VaultBound(address indexed vault);

    event RewardManagerUpdated(address indexed previousManager, address indexed newManager);

    event TreasurySharesRedeemed(uint256 assets, uint256 shares);

    event RewardPaid(bytes32 indexed rewardId, address indexed recipient, uint256 assets);

    event AssetsWithdrawn(address indexed recipient, uint256 assets);

    modifier onlyRewardManager() {
        if (msg.sender != rewardManager) {
            revert UnauthorizedRewardManager(msg.sender);
        }

        _;
    }

    constructor(IERC20 asset_, address initialOwner) Ownable(initialOwner) {
        if (
            address(asset_) == address(0) || address(asset_).code.length == 0
                || IERC20Metadata(address(asset_)).decimals() != 6
        ) {
            revert InvalidAsset();
        }

        asset = asset_;
    }

    /// @notice Bind the treasury permanently to the
    /// Kept vault that sends fee shares to it.
    function bindVault(address vault_) external onlyOwner {
        if (address(vault) != address(0)) {
            revert VaultAlreadyBound();
        }

        if (vault_ == address(0) || vault_.code.length == 0) {
            revert InvalidVault();
        }

        KeptSavingsVault candidate = KeptSavingsVault(vault_);

        if (candidate.asset() != address(asset)) {
            revert VaultAssetMismatch();
        }

        if (candidate.feeRecipient() != address(this)) {
            revert VaultFeeRecipientMismatch();
        }

        vault = candidate;

        emit VaultBound(vault_);
    }

    /// @notice Set the contract/address authorised
    /// to issue commitment rewards.
    function setRewardManager(address newRewardManager) external onlyOwner {
        if (newRewardManager == address(0)) {
            revert InvalidRewardManager();
        }

        address previousManager = rewardManager;

        rewardManager = newRewardManager;

        emit RewardManagerUpdated(previousManager, newRewardManager);
    }

    /// @notice Convert Kept-owned vault shares into USDC.
    function redeemRevenue(uint256 assets) external onlyOwner nonReentrant returns (uint256 shares) {
        if (assets == 0) {
            revert ZeroAssets();
        }

        shares = _realiseRevenue(assets);
    }

    /// @notice Pay a verified commitment reward using
    /// Kept-owned revenue.
    function payReward(bytes32 rewardId, address recipient, uint256 assets)
        external
        onlyRewardManager
        whenNotPaused
        nonReentrant
    {
        if (rewardId == bytes32(0)) {
            revert InvalidRewardId();
        }

        if (recipient == address(0)) {
            revert InvalidRecipient();
        }

        if (assets == 0) {
            revert ZeroAssets();
        }

        if (assets > MAX_REWARD) {
            revert RewardTooLarge(assets, MAX_REWARD);
        }

        if (rewardUsed[rewardId]) {
            revert RewardAlreadyUsed(rewardId);
        }

        /*
         * Mark before external interaction.
         * If anything later reverts, this write
         * also rolls back.
         */
        rewardUsed[rewardId] = true;

        uint256 idle = asset.balanceOf(address(this));

        if (idle < assets) {
            _realiseRevenue(assets - idle);
        }

        asset.safeTransfer(recipient, assets);

        emit RewardPaid(rewardId, recipient, assets);
    }

    /// @notice Withdraw realised Kept revenue for
    /// company operations.
    function withdrawAssets(address recipient, uint256 assets) external onlyOwner nonReentrant {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }

        if (assets == 0) {
            revert ZeroAssets();
        }

        uint256 idle = asset.balanceOf(address(this));

        if (idle < assets) {
            _realiseRevenue(assets - idle);
        }

        asset.safeTransfer(recipient, assets);

        emit AssetsWithdrawn(recipient, assets);
    }

    function pauseRewards() external onlyOwner {
        _pause();
    }

    function unpauseRewards() external onlyOwner {
        _unpause();
    }

    /// @dev Realises only value represented by shares
    /// owned by this treasury.
    function _realiseRevenue(uint256 assets) internal returns (uint256 shares) {
        KeptSavingsVault bound = vault;

        if (address(bound) == address(0)) {
            revert InvalidVault();
        }

        uint256 available = bound.maxWithdraw(address(this));

        if (assets > available) {
            revert InsufficientTreasuryValue(assets, available);
        }

        shares = bound.withdraw(assets, address(this), address(this));

        emit TreasurySharesRedeemed(assets, shares);
    }
}
