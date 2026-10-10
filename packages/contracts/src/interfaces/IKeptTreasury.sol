// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IKeptTreasury {
    function reserveReward(bytes32 rewardId, uint256 assets) external;
    function payReward(bytes32 rewardId, address recipient, uint256 assets) external;
}
