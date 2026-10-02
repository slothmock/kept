// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Test-only six-decimal USDC stand-in for Kept staging.
/// @dev Deployment is restricted to Monad testnet or local Anvil.
contract StagingUSDC is ERC20, Ownable {
    error UnsupportedChain(uint256 chainId);
    error UnauthorizedMinter(address caller);

    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10143;
    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    mapping(address minter => bool allowed) public minters;

    event MinterUpdated(address indexed minter, bool allowed);

    constructor(address initialOwner)
        ERC20("Kept Staging USDC", "kUSDC")
        Ownable(initialOwner)
    {
        if (
            block.chainid != MONAD_TESTNET_CHAIN_ID
                && block.chainid != ANVIL_CHAIN_ID
        ) {
            revert UnsupportedChain(block.chainid);
        }
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
        emit MinterUpdated(minter, allowed);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner() && !minters[msg.sender]) {
            revert UnauthorizedMinter(msg.sender);
        }

        _mint(to, amount);
    }
}
