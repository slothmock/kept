// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {KeptSavingsVault} from "../src/KeptSavingsVault.sol";
import {AaveUSDCStrategy} from "../src/AaveUSDCStrategy.sol";
import {MockUSDC, MockAToken, MockAavePool} from "./mocks/MockAave.sol";

contract VaultHandler is Test {
    MockUSDC public immutable token;
    MockAToken public immutable aToken;
    KeptSavingsVault public immutable vault;
    AaveUSDCStrategy public immutable strategy;

    bool public strategyAuthorityViolation;
    bool public ownerPrincipalViolation;
    bool public performanceFeeViolation;
    bool public shareTransferViolation;

    constructor(MockUSDC token_, MockAToken aToken_, KeptSavingsVault vault_, AaveUSDCStrategy strategy_) {
        token = token_;
        aToken = aToken_;
        vault = vault_;
        strategy = strategy_;
        token_.approve(address(vault_), type(uint256).max);
    }

    function deposit(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000e6);
        token.mint(address(this), amount);
        try vault.deposit(amount, address(this)) {} catch {}
    }

    function withdraw(uint96 rawAmount) external {
        uint256 maximum = vault.maxWithdraw(address(this));
        if (maximum == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, maximum);
        try vault.withdraw(amount, address(this), address(this)) {} catch {}
    }

    function redeem(uint96 rawShares) external {
        uint256 maximum = vault.maxRedeem(address(this));
        if (maximum == 0) return;
        uint256 shares = bound(uint256(rawShares), 1, maximum);
        try vault.redeem(shares, address(this), address(this)) {} catch {}
    }

    function donate(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, 100e6);
        token.mint(address(this), amount);
        token.transfer(address(vault), amount);
    }

    function accrueYieldAndCrystallize(uint96 rawYield) external {
        if (vault.totalSupply() == 0) return;
        uint256 amount = bound(uint256(rawYield), 1, 100e6);
        aToken.accrueYield(address(strategy), amount);

        uint256 assetsBefore = vault.totalAssets();
        uint256 hwmBefore = vault.highWaterMarkAssets();
        uint256 profit = assetsBefore > hwmBefore ? assetsBefore - hwmBefore : 0;
        uint256 maximumFee = profit * vault.PROFIT_FEE_BPS() / vault.BPS_DENOMINATOR();

        (uint256 feeAssets,) = vault.crystallizeYieldFee();
        if (feeAssets > maximumFee) performanceFeeViolation = true;
    }

    function crystallize() external {
        vault.crystallizeYieldFee();
    }

    function callStrategyDirectly(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, 100e6);
        try strategy.deposit(amount) returns (uint256) {
            strategyAuthorityViolation = true;
        } catch {}
        try strategy.withdraw(amount) returns (uint256) {
            strategyAuthorityViolation = true;
        } catch {}
    }

    function attemptShareTransfer(uint96 rawShares) external {
        uint256 balance = vault.balanceOf(address(this));
        if (balance == 0) return;
        uint256 shares = bound(uint256(rawShares), 1, balance);
        try vault.transfer(address(0xB0B), shares) returns (bool) {
            shareTransferViolation = true;
        } catch {}
    }

    function exerciseOwnerOperations() external {
        uint256 sharesBefore = vault.balanceOf(address(this));
        if (vault.paused()) {
            vm.prank(vault.owner());
            vault.unpause();
        } else {
            vm.prank(vault.owner());
            vault.pause();
        }
        if (vault.balanceOf(address(this)) < sharesBefore) ownerPrincipalViolation = true;
    }
}

contract VaultInvariantTest is StdInvariant, Test {
    MockUSDC internal token;
    MockAToken internal aToken;
    KeptSavingsVault internal vault;
    AaveUSDCStrategy internal strategy;
    VaultHandler internal handler;

    function setUp() public {
        token = new MockUSDC();
        aToken = new MockAToken(address(token));
        MockAavePool pool = new MockAavePool(token, aToken);
        vault = new KeptSavingsVault(IERC20(address(token)), address(this), makeAddr("feeRecipient"));
        strategy = new AaveUSDCStrategy(address(vault), address(token), address(pool), address(aToken));
        vault.bindStrategy(address(strategy));
        handler = new VaultHandler(token, aToken, vault, strategy);
        targetContract(address(handler));
    }

    function invariant_TotalAssetsEqualsIdlePlusStrategy() public view {
        assertEq(vault.totalAssets(), token.balanceOf(address(vault)) + strategy.totalAssets());
    }

    function invariant_StrategyPositionCannotExceedVaultAssets() public view {
        assertLe(strategy.totalAssets(), vault.totalAssets());
    }

    function invariant_StrategyAssetMovementIsVaultOnly() public view {
        assertFalse(handler.strategyAuthorityViolation());
    }

    function invariant_OwnerOperationsCannotReduceUserShares() public view {
        assertFalse(handler.ownerPrincipalViolation());
    }

    function invariant_PerformanceFeeNeverExceedsTenPercentOfNewProfit() public view {
        assertFalse(handler.performanceFeeViolation());
    }

    function invariant_UserSharesCannotBeTransferred() public view {
        assertFalse(handler.shareTransferViolation());
    }
}
