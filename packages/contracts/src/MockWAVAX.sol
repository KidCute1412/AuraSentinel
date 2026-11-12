// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FaucetToken} from "./FaucetToken.sol";

/// @title MockWAVAX
/// @notice Testnet WAVAX stand-in (18 decimals), the other side of the demo pool. Real Fuji WAVAX cannot be
///         collected in pool-sized amounts from faucets, so the pool would be too thin for 500 USDC swaps (L4).
///         Same faucet rules as MockUSDC; not redeemable for AVAX.
contract MockWAVAX is FaucetToken {
    constructor(uint256 initialSupply_, uint256 faucetAmount_, uint256 faucetCooldown_)
        FaucetToken("Mock WAVAX (AgentShield)", "WAVAX", 18, initialSupply_, faucetAmount_, faucetCooldown_)
    {}
}
