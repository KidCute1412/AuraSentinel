// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./IERC20.sol";

/// Testnet USDC (6 decimals) with a public faucet and a per-address cooldown.
interface IMockUSDC is IERC20 {
    error FaucetCooldown(uint256 availableAt);

    /// Standard ERC-20 events, so wallets and Snowtrace track balances.
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function faucetAmount() external view returns (uint256);
    function faucetCooldown() external view returns (uint256);
    function lastFaucetAt(address account) external view returns (uint256);

    /// Mints `faucetAmount()` to the caller; reverts with FaucetCooldown before the cooldown ends.
    function faucet() external;
}
