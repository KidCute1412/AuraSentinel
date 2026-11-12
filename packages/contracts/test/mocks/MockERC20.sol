// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Test ERC-20. `stickyApprove` makes approve(spender, 0) a no-op, to exercise ResidualAllowance.
contract MockERC20 {
    string public name;
    uint8 public immutable decimals;
    bool public stickyApprove;
    /// Tracked so the invariant suite can prove no token ends up outside the Safe and the router.
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, uint8 decimals_) {
        name = name_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function setStickyApprove(bool v) external {
        stickyApprove = v;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (stickyApprove && amount == 0) return true;
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
