// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

contract MockWrongDecimalsToken is ERC20 {
    constructor() ERC20("Wrong Decimals", "WRONG") {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

contract MockAToken is ERC20 {
    using SafeERC20 for IERC20;

    address public immutable UNDERLYING_ASSET_ADDRESS;
    address public pool;

    constructor(address underlying) ERC20("Aave Monad USDC", "aMonUSDC") {
        UNDERLYING_ASSET_ADDRESS = underlying;
    }

    function setPool(address newPool) external {
        require(pool == address(0), "POOL_SET");
        pool = newPool;
    }

    function mintPosition(address to, uint256 amount) external {
        require(msg.sender == pool, "ONLY_POOL");
        _mint(to, amount);
    }

    function burnPosition(address from, uint256 amount) external {
        require(msg.sender == pool, "ONLY_POOL");
        _burn(from, amount);
    }

    function transferUnderlying(address to, uint256 amount) external {
        require(msg.sender == pool, "ONLY_POOL");
        IERC20(UNDERLYING_ASSET_ADDRESS).safeTransfer(to, amount);
    }

    function accrueYield(address account, uint256 amount) external {
        _mint(account, amount);
        MockUSDC(UNDERLYING_ASSET_ADDRESS).mint(address(this), amount);
    }

    function removeLiquidity(address to, uint256 amount) external {
        IERC20(UNDERLYING_ASSET_ADDRESS).safeTransfer(to, amount);
    }
}

contract MockAavePool {
    using SafeERC20 for IERC20;

    MockUSDC public immutable asset;
    MockAToken public immutable aToken;
    bool public failSupply;
    bool public returnWrongWithdrawAmount;

    constructor(MockUSDC asset_, MockAToken aToken_) {
        asset = asset_;
        aToken = aToken_;
        aToken_.setPool(address(this));
    }

    function setFailSupply(bool value) external {
        failSupply = value;
    }

    function setReturnWrongWithdrawAmount(bool value) external {
        returnWrongWithdrawAmount = value;
    }

    function supply(address suppliedAsset, uint256 amount, address onBehalfOf, uint16) external {
        require(!failSupply, "SUPPLY_FAILED");
        require(suppliedAsset == address(asset), "WRONG_ASSET");
        IERC20(suppliedAsset).safeTransferFrom(msg.sender, address(aToken), amount);
        aToken.mintPosition(onBehalfOf, amount);
    }

    function withdraw(address withdrawnAsset, uint256 amount, address to) external returns (uint256) {
        require(withdrawnAsset == address(asset), "WRONG_ASSET");
        require(asset.balanceOf(address(aToken)) >= amount, "INSUFFICIENT_LIQUIDITY");
        aToken.burnPosition(msg.sender, amount);
        aToken.transferUnderlying(to, amount);
        return returnWrongWithdrawAmount ? amount - 1 : amount;
    }
}
