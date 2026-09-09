// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IYieldStrategy {
    function asset() external view returns (address);
    function deposit(uint256 assets) external returns (uint256 deposited);
    function withdraw(uint256 assets) external returns (uint256 withdrawn);
    function totalAssets() external view returns (uint256);
    function availableLiquidity() external view returns (uint256);
}
