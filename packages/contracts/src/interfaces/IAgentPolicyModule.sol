// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// External surface of AgentPolicyModule. Source of truth: docs/architecture/contracts.md.
/// Error names are mirrored in packages/shared/src/errors.ts (REASONS); keep them in sync.
interface IAgentPolicyModule {
    struct Policy {
        address agentSigner;
        address router; // Trader Joe V1 router, the only one allowed
        uint64 expiry; // unix seconds
        bool isActive; // Kill-Switch sets this to false
    }

    /// Smallest token units (C1). `dailyCap == 0` means the token is not allowed.
    struct Limits {
        uint128 maxPerTx;
        uint128 dailyCap;
    }

    // Gate 1: who and when
    error UnauthorizedAgent();
    error PolicyInactive();
    error PolicyExpired();
    // Gate 2: which tokens
    error TokenNotWhitelisted();
    error SameToken();
    // Gate 3-4: how much
    error ExceedsPerTxCap();
    error ExceedsDailyCap();
    // Swap parameters
    error ZeroMinOut();
    error DeadlineTooFar();
    // Gate 5: execution
    error SwapFailed();
    error InsufficientOutput();
    error ResidualAllowance();
    // Owner functions and guard
    error NotOwner();
    error InvalidPolicy();
    error Reentrancy();

    /// `epoch` is `policyEpoch` after the write: each setPolicy starts a fresh budget (D10).
    event PolicySet(
        address indexed agentSigner,
        uint256 epoch,
        address router,
        uint64 expiry,
        bool isActive,
        address[] tokens,
        Limits[] limits
    );
    event PolicyRevoked(address indexed by, uint64 at);
    event GuardedSwap(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 dayId,
        uint256 spentToday
    );

    function safe() external view returns (address);
    function owner() external view returns (address);
    function policy() external view returns (address agentSigner, address router, uint64 expiry, bool isActive);
    function policyEpoch() external view returns (uint256);
    function limits(address token) external view returns (uint128 maxPerTx, uint128 dailyCap);
    function whitelistedTokens() external view returns (address[] memory);
    function spentToday(address token) external view returns (uint256);
    function spentInDay(address token, uint256 dayId) external view returns (uint256);

    function setPolicy(Policy calldata p, address[] calldata tokens, Limits[] calldata l) external;
    function revoke() external;
    function executeGuardedSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external;
}
