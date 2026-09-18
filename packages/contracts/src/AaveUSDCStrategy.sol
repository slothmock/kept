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
    error ATokenPoolMismatch();

    error ZeroAssets();

    error InsufficientIdleAssets(
        uint256 required,
        uint256 available
    );

    error InsufficientAaveLiquidity(
        uint256 requested,
        uint256 available
    );

    error UnexpectedWithdrawAmount(
        uint256 requested,
        uint256 received
    );

    error ProtectedToken();

    event StrategyDeposit(uint256 assets);
    event StrategyWithdrawal(uint256 assets);

    event TokenRescued(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    address public immutable vault;

    address public immutable override asset;

    IAavePool public immutable aavePool;

    IAaveAToken public immutable aToken;

    modifier onlyVault() {
        if (msg.sender != vault) {
            revert UnauthorizedVaultCaller(
                msg.sender
            );
        }

        _;
    }

    constructor(
        address vault_,
        address asset_,
        address aavePool_,
        address aToken_
    ) {
        if (vault_ == address(0)) {
            revert InvalidVault();
        }

        if (
            asset_ == address(0) ||
            asset_.code.length == 0 ||
            IERC20Metadata(asset_).decimals() != 6
        ) {
            revert InvalidAsset();
        }

        if (
            aavePool_ == address(0) ||
            aavePool_.code.length == 0
        ) {
            revert InvalidAavePool();
        }

        if (
            aToken_ == address(0) ||
            aToken_.code.length == 0
        ) {
            revert InvalidAToken();
        }

        if (
            IAaveAToken(aToken_)
                .UNDERLYING_ASSET_ADDRESS()
                != asset_
        ) {
            revert ATokenAssetMismatch();
        }

        /*
         * Ensure the supplied aToken really belongs
         * to this Pool's reserve for asset_.
         */
        address reserveAToken =
            IAavePool(aavePool_)
                .getReserveAToken(asset_);

        if (reserveAToken != aToken_) {
            revert ATokenPoolMismatch();
        }

        vault = vault_;
        asset = asset_;
        aavePool = IAavePool(aavePool_);
        aToken = IAaveAToken(aToken_);

        /*
         * Aave's Pool pulls the underlying asset
         * from this strategy during supply().
         */
        IERC20(asset_).forceApprove(
            aavePool_,
            type(uint256).max
        );
    }

    function deposit(
        uint256 assets
    )
        external
        onlyVault
        returns (uint256 deposited)
    {
        if (assets == 0) {
            revert ZeroAssets();
        }

        uint256 idle =
            IERC20(asset).balanceOf(
                address(this)
            );

        if (idle < assets) {
            revert InsufficientIdleAssets(
                assets,
                idle
            );
        }

        /*
         * If supply() succeeds, Aave has accepted
         * the position and minted the corresponding
         * interest-bearing aToken exposure.
         */
        aavePool.supply(
            asset,
            assets,
            address(this),
            0
        );

        emit StrategyDeposit(assets);

        return assets;
    }

    function withdraw(
        uint256 assets
    )
        external
        onlyVault
        returns (uint256 withdrawn)
    {
        if (assets == 0) {
            revert ZeroAssets();
        }

        uint256 available =
            availableLiquidity();

        if (assets > available) {
            revert InsufficientAaveLiquidity(
                assets,
                available
            );
        }

        IERC20 token = IERC20(asset);

        uint256 idle =
            token.balanceOf(address(this));

        /*
         * Use any USDC already sitting in the
         * strategy before touching Aave.
         */
        if (idle < assets) {
            uint256 shortfall =
                assets - idle;

            uint256 balanceBefore =
                token.balanceOf(
                    address(this)
                );

            uint256 received =
                aavePool.withdraw(
                    asset,
                    shortfall,
                    address(this)
                );

            uint256 balanceAfter =
                token.balanceOf(
                    address(this)
                );

            uint256 balanceIncrease =
                balanceAfter - balanceBefore;

            if (
                received != shortfall ||
                balanceIncrease != shortfall
            ) {
                revert UnexpectedWithdrawAmount(
                    shortfall,
                    received
                );
            }
        }

        token.safeTransfer(
            vault,
            assets
        );

        emit StrategyWithdrawal(assets);

        return assets;
    }

    function totalAssets()
        public
        view
        returns (uint256)
    {
        uint256 idle =
            IERC20(asset).balanceOf(
                address(this)
            );

        uint256 supplied =
            aToken.balanceOf(
                address(this)
            );

        return idle + supplied;
    }

    function availableLiquidity()
        public
        view
        returns (uint256)
    {
        uint256 idle =
            IERC20(asset).balanceOf(
                address(this)
            );

        uint256 position =
            aToken.balanceOf(
                address(this)
            );

        /*
         * Aave reserve liquidity is the underlying
         * currently available at the aToken.
         *
         * We can withdraw at most:
         *
         * min(
         *     our supplied position,
         *     reserve liquidity
         * )
         */
        uint256 reserveCash =
            IERC20(asset).balanceOf(
                address(aToken)
            );

        uint256 withdrawableFromAave =
            position < reserveCash
                ? position
                : reserveCash;

        return
            idle +
            withdrawableFromAave;
    }

    /// @notice Recover unrelated tokens accidentally
    /// sent to the strategy.
    ///
    /// @dev USDC and the Aave aToken are explicitly
    /// protected because they represent vault assets.
    function rescueToken(
        address token,
        address recipient
    )
        external
        onlyVault
        returns (uint256 amount)
    {
        if (
            token == asset ||
            token == address(aToken)
        ) {
            revert ProtectedToken();
        }

        amount =
            IERC20(token).balanceOf(
                address(this)
            );

        if (amount != 0) {
            IERC20(token).safeTransfer(
                recipient,
                amount
            );

            emit TokenRescued(
                token,
                recipient,
                amount
            );
        }
    }
}