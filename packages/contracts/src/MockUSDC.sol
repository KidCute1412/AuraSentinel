// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IMockUSDC} from "./interfaces/IMockUSDC.sol";

/// @title MockUSDC
/// @notice Testnet-only USDC stand-in (6 decimals) for Avalanche Fuji. Anyone can take `faucetAmount` once per
///         `faucetCooldown` from `faucet()`; there is no other way to mint after deployment.
/// @dev The deployer gets `initialSupply` once, to seed the Trader Joe pool and the demo vaults (L4).
///      Keep `faucetAmount` small next to the pool depth: many wallets could otherwise faucet and dump into the pool.
contract MockUSDC is IMockUSDC {
    string public constant name = "Mock USDC (AgentShield)";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    uint256 public immutable faucetAmount;
    uint256 public immutable faucetCooldown;
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    mapping(address => uint256) private _lastFaucetAt;

    constructor(uint256 initialSupply_, uint256 faucetAmount_, uint256 faucetCooldown_) {
        require(faucetAmount_ > 0, "MockUSDC: faucet amount 0");
        faucetAmount = faucetAmount_;
        faucetCooldown = faucetCooldown_;
        if (initialSupply_ > 0) _mint(msg.sender, initialSupply_);
    }

    // ----------------------------------------------------------------- faucet

    function lastFaucetAt(address account) external view returns (uint256) {
        return _lastFaucetAt[account];
    }

    /// First call always succeeds; afterwards the next one is allowed from `last + faucetCooldown` on.
    function faucet() external {
        uint256 last = _lastFaucetAt[msg.sender];
        if (last != 0) {
            uint256 availableAt = last + faucetCooldown;
            if (block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        }
        _lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }

    // ------------------------------------------------------------------ ERC-20

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// Exact allowances only: no "infinite approval" shortcut, so allowance always drops by `amount`.
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = _allowances[from][msg.sender];
        require(allowed >= amount, "MockUSDC: allowance");
        unchecked {
            _allowances[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "MockUSDC: to zero");
        uint256 bal = _balances[from];
        require(bal >= amount, "MockUSDC: balance");
        unchecked {
            _balances[from] = bal - amount;
        }
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) private {
        totalSupply += amount;
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
