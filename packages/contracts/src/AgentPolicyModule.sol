// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAgentPolicyModule} from "./interfaces/IAgentPolicyModule.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {ISafe} from "./interfaces/ISafe.sol";
import {ITraderJoeRouter} from "./interfaces/ITraderJoeRouter.sol";

/// @title AgentPolicyModule (Shield 2)
/// @notice Safe module that lets one agent key swap between whitelisted tokens through one router,
///         within per-tx and per-day caps. The agent has no parameter for recipient, path or approvals,
///         and no function here can move funds out of the Safe other than the guarded swap.
/// @dev Spec: docs/architecture/contracts.md. Fixes C1-C9 from system-design.md section 6.
contract AgentPolicyModule is IAgentPolicyModule {
    uint256 public constant MAX_DEADLINE_WINDOW = 10 minutes; // C4
    uint256 public constant MAX_TOKENS = 16;

    ISafe private immutable _safe;
    address public immutable owner;

    Policy public policy;
    /// Incremented by every setPolicy: a new policy starts a fresh budget (D10).
    uint256 public policyEpoch;
    /// C1: limits are per token, in that token's smallest unit.
    mapping(address token => Limits) public limits;

    address[] private _tokens;
    mapping(uint256 epoch => mapping(address token => mapping(uint256 dayId => uint256))) private _spent;
    uint256 private _lock = 1;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        _lockEnter();
        _;
        _lock = 1;
    }

    constructor(address safe_, address owner_) {
        // A zero owner would brick setPolicy/revoke for good, so reject it here.
        if (safe_ == address(0) || owner_ == address(0)) revert InvalidPolicy();
        _safe = ISafe(safe_);
        owner = owner_;
    }

    function _lockEnter() private {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
    }

    // ------------------------------------------------------------------ views

    function safe() external view returns (address) {
        return address(_safe);
    }

    function whitelistedTokens() external view returns (address[] memory) {
        return _tokens;
    }

    function spentToday(address token) external view returns (uint256) {
        return _spent[policyEpoch][token][block.timestamp / 1 days];
    }

    /// Spend in the current epoch for an arbitrary UTC day.
    function spentInDay(address token, uint256 dayId) external view returns (uint256) {
        return _spent[policyEpoch][token][dayId];
    }

    // ------------------------------------------------------------------ owner

    /// @notice Replaces policy and limits, and starts a new budget epoch. Also re-activates after a Kill-Switch
    ///         when `p.isActive` is true. Tokens that were allowed before and are missing now are removed.
    function setPolicy(Policy calldata p, address[] calldata tokens, Limits[] calldata l) external onlyOwner {
        uint256 n = tokens.length;
        if (
            p.agentSigner == address(0) || p.router == address(0) || p.expiry <= block.timestamp || n != l.length
                || n > MAX_TOKENS
        ) revert InvalidPolicy();

        uint256 old = _tokens.length;
        for (uint256 i; i < old; ++i) {
            delete limits[_tokens[i]];
        }
        delete _tokens;

        for (uint256 i; i < n; ++i) {
            address token = tokens[i];
            Limits calldata lim = l[i];
            // A token listed twice, or with caps that cannot work, is an owner mistake: fail loudly.
            if (
                token == address(0) || limits[token].dailyCap != 0 || lim.maxPerTx == 0 || lim.dailyCap == 0
                    || lim.maxPerTx > lim.dailyCap
            ) revert InvalidPolicy();
            limits[token] = lim;
            _tokens.push(token);
        }

        policy = p;
        uint256 epoch = ++policyEpoch;
        emit PolicySet(p.agentSigner, epoch, p.router, p.expiry, p.isActive, tokens, l);
    }

    /// @notice Kill-Switch: every executeGuardedSwap reverts until the owner calls setPolicy again.
    function revoke() external onlyOwner {
        policy.isActive = false;
        emit PolicyRevoked(msg.sender, uint64(block.timestamp));
    }

    // ------------------------------------------------------------------ agent

    /// @notice Swaps `amountIn` of `tokenIn` for at least `minOut` of `tokenOut`, from and to the Safe.
    /// @dev Gate order matters: the first failing check is the error the caller sees.
    function executeGuardedSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        nonReentrant
    {
        Policy memory p = policy;
        // Gate 1: who and when
        if (msg.sender != p.agentSigner) revert UnauthorizedAgent();
        if (!p.isActive) revert PolicyInactive();
        if (block.timestamp > p.expiry) revert PolicyExpired();

        // Gate 2: which tokens
        Limits memory lim = limits[tokenIn];
        if (lim.dailyCap == 0 || limits[tokenOut].dailyCap == 0) revert TokenNotWhitelisted();
        if (tokenIn == tokenOut) revert SameToken();

        // Gate 3-4: how much
        if (amountIn > lim.maxPerTx) revert ExceedsPerTxCap();
        uint256 dayId = block.timestamp / 1 days;
        uint256 spent = _spent[policyEpoch][tokenIn][dayId] + amountIn;
        if (spent > lim.dailyCap) revert ExceedsDailyCap();

        // Swap parameters (C3, C4)
        if (minOut == 0) revert ZeroMinOut();
        if (deadline > block.timestamp + MAX_DEADLINE_WINDOW) revert DeadlineTooFar();

        // Effects before interactions: a revert further down rolls this back too.
        _spent[policyEpoch][tokenIn][dayId] = spent;

        // Gate 5: execution
        uint256 amountOut = _swap(p.router, tokenIn, tokenOut, amountIn, minOut, deadline);
        emit GuardedSwap(tokenIn, tokenOut, amountIn, amountOut, dayId, spent);
    }

    function _swap(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) private returns (uint256 amountOut) {
        // C2: path is built here, never taken from the caller.
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        address safeAddr = address(_safe);
        // Reading the balance before the external calls is the point of C9. Re-entering executeGuardedSwap is
        // blocked by nonReentrant; any other change in between can only add tokenOut to the Safe.
        // slither-disable-start reentrancy-balance
        uint256 balBefore = IERC20(tokenOut).balanceOf(safeAddr);

        // Exact approval, then the swap with the Safe as recipient (hard-coded).
        _execFromSafe(tokenIn, abi.encodeCall(IERC20.approve, (router, amountIn)));
        _execFromSafe(
            router,
            abi.encodeCall(ITraderJoeRouter.swapExactTokensForTokens, (amountIn, minOut, path, safeAddr, deadline))
        );

        // C9: judge by the balance change, not by what the router says it returned.
        amountOut = IERC20(tokenOut).balanceOf(safeAddr) - balBefore;
        if (amountOut < minOut) revert InsufficientOutput();
        // slither-disable-end reentrancy-balance

        // C5: no allowance may survive the call.
        if (IERC20(tokenIn).allowance(safeAddr, router) != 0) {
            bool reset = _tryExecFromSafe(tokenIn, abi.encodeCall(IERC20.approve, (router, 0)));
            if (!reset || IERC20(tokenIn).allowance(safeAddr, router) != 0) revert ResidualAllowance();
        }
    }

    function _execFromSafe(address to, bytes memory data) private {
        if (!_tryExecFromSafe(to, data)) revert SwapFailed();
    }

    /// C6: always `Operation.Call`, never `DelegateCall`.
    function _tryExecFromSafe(address to, bytes memory data) private returns (bool) {
        return _safe.execTransactionFromModule(to, 0, data, ISafe.Operation.Call);
    }
}
