// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./IERC20.sol";

/// Testnet USDC (6 decimals) with a public faucet and a per-address cooldown (implemented in L3).
interface IMockUSDC is IERC20 {
    error FaucetCooldown(uint256 availableAt);

    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function faucetAmount() external view returns (uint256);
    function faucetCooldown() external view returns (uint256);
    function lastFaucetAt(address account) external view returns (uint256);

    /// Mints `faucetAmount()` to the caller; reverts with FaucetCooldown before the cooldown ends.
    function faucet() external;
}
