// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Test-only ERC-20 subset: balances and allowances anyone can set (no access control on purpose).
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function burn(address from, uint256 amount) external { balanceOf[from] -= amount; }
    function setAllowance(address owner, address spender, uint256 amount) external { allowance[owner][spender] = amount; }
}

/// Test double of AgentPolicyModule for server integration tests (A4/A5). Same external ABI as
/// docs/architecture/contracts.md §3-§4 for the parts the server uses; gates are simplified and
/// the "swap" burns tokenIn / mints minOut on the Safe instead of calling a router.
/// NOT the real module (that is packages/contracts, L1).
contract MockPolicyModule {
    error UnauthorizedAgent();
    error PolicyInactive();
    error ExceedsPerTxCap();
    error ZeroMinOut();
    error DeadlineTooFar();

    struct Policy { address agentSigner; address router; uint64 expiry; bool isActive; }

    Policy public policy;
    address public immutable safe;
    uint256 public immutable maxPerTx;
    /// Simulates a buggy swap that leaves an allowance behind (post-sim invariant must catch it).
    bool public leaveAllowance;

    constructor(address safe_, address agent, address router, uint256 maxPerTx_) {
        safe = safe_;
        maxPerTx = maxPerTx_;
        policy = Policy(agent, router, uint64(block.timestamp + 365 days), true);
    }

    function revoke() external { policy.isActive = false; }
    function setLeaveAllowance(bool v) external { leaveAllowance = v; }

    function executeGuardedSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline) external {
        if (msg.sender != policy.agentSigner) revert UnauthorizedAgent();
        if (!policy.isActive) revert PolicyInactive();
        if (amountIn > maxPerTx) revert ExceedsPerTxCap();
        if (minOut == 0) revert ZeroMinOut();
        if (deadline > block.timestamp + 10 minutes) revert DeadlineTooFar();
        MockToken(tokenIn).burn(safe, amountIn);
        MockToken(tokenOut).mint(safe, minOut);
        if (leaveAllowance) MockToken(tokenIn).setAllowance(safe, policy.router, 1);
    }
}
