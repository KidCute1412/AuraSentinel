// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FaucetToken} from "./FaucetToken.sol";

/// @title MockUSDC
/// @notice Testnet USDC stand-in (6 decimals) with a public faucet. Fuji: 1,000,000 to the deployer, 5,000 per hour.
contract MockUSDC is FaucetToken {
    constructor(uint256 initialSupply_, uint256 faucetAmount_, uint256 faucetCooldown_)
        FaucetToken("Mock USDC (AgentShield)", "USDC", 6, initialSupply_, faucetAmount_, faucetCooldown_)
    {}
}
