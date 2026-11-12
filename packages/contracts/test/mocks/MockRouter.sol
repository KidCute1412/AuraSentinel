// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockERC20} from "./MockERC20.sol";

/// Trader Joe V1 stand-in. Pulls tokenIn with transferFrom (so it needs a real allowance) and pays tokenOut at a
/// fixed rate, minus `shortfallBps`. Records the last call so tests can check path and recipient.
contract MockRouter {
    /// tokenOut per tokenIn, scaled by 1e18 and expressed in raw units (the test sets decimals-aware rates).
    uint256 public rate = 1e18;
    uint256 public shortfallBps;
    bool public failSwap;
    /// Lying router: pays the shortfall without enforcing amountOutMin (the module must catch it, C9).
    bool public ignoreMinOut;
    /// Pull this fraction (bps) of amountIn, leaving the rest of the allowance behind.
    uint256 public pullBps = 10_000;
    address public reenterTarget;
    bytes public reenterData;

    address public lastTo;
    uint256 public lastDeadline;
    address[] public lastPath;

    function setRate(uint256 r) external {
        rate = r;
    }

    function setShortfallBps(uint256 v) external {
        shortfallBps = v;
    }

    function setFailSwap(bool v) external {
        failSwap = v;
    }

    function setIgnoreMinOut(bool v) external {
        ignoreMinOut = v;
    }

    function setPullBps(uint256 v) external {
        pullBps = v;
    }

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterData = data;
    }

    function lastPathLength() external view returns (uint256) {
        return lastPath.length;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(!failSwap, "ROUTER_FAIL");
        require(block.timestamp <= deadline, "EXPIRED");
        if (reenterTarget != address(0)) {
            (bool ok, bytes memory ret) = reenterTarget.call(reenterData);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }

        lastTo = to;
        lastDeadline = deadline;
        delete lastPath;
        for (uint256 i; i < path.length; ++i) {
            lastPath.push(path[i]);
        }

        MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn * pullBps / 10_000);
        uint256 out = amountIn * rate / 1e18;
        out = out * (10_000 - shortfallBps) / 10_000;
        if (!ignoreMinOut) require(out >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");
        MockERC20(path[1]).mint(to, out);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}
