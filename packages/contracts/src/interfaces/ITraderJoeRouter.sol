// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Trader Joe V1 router (Uniswap V2 style). The module only ever calls this one function.
interface ITraderJoeRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}
