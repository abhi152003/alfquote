// SPDX-License-Identifier: MIT
// Excerpt from Uniswap v4-core StateLibrary.sol
// https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/StateLibrary.sol
pragma solidity ^0.8.0;

library StateLibrary {
    /// @notice index of pools mapping in the PoolManager
    bytes32 public constant POOLS_SLOT = bytes32(uint256(6));

    /// @notice index of liquidity in Pool.State
    uint256 public constant LIQUIDITY_OFFSET = 3;
}
