// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPolicyModule} from "../../src/AgentPolicyModule.sol";
import {IAgentPolicyModule} from "../../src/interfaces/IAgentPolicyModule.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {ISafe} from "../../src/interfaces/ISafe.sol";

interface IRouterQuote {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
}

/// The REAL Fuji deployment (deployments/fuji.json) on a fork: the verified module, the real Safe and the real
/// Trader Joe pool. Opt-in, because it needs an RPC:
///
///   FUJI_FORK=true forge test --match-path "test/fork/*" -vv
///   (FUJI_RPC_URL overrides the public Fuji RPC)
contract FujiDeploymentForkTest is Test {
    AgentPolicyModule internal module;
    address internal safe;
    address internal usdc;
    address internal wavax;
    address internal router;
    address internal agent;
    address internal owner;

    function setUp() public {
        if (!vm.envOr("FUJI_FORK", false)) {
            vm.skip(true, "set FUJI_FORK=true to run against the real Fuji deployment");
            return;
        }
        vm.createSelectFork(vm.envOr("FUJI_RPC_URL", string("https://api.avax-test.network/ext/bc/C/rpc")));
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/fuji.json"));
        module = AgentPolicyModule(vm.parseJsonAddress(json, ".publicModule"));
        safe = vm.parseJsonAddress(json, ".publicSafe");
        usdc = vm.parseJsonAddress(json, ".usdc");
        wavax = vm.parseJsonAddress(json, ".wavax");
        router = vm.parseJsonAddress(json, ".router");
        agent = vm.parseJsonAddress(json, ".agent");
        owner = module.owner();
        (,,, bool active) = module.policy();
        require(active, "public vault is killed on Fuji: re-activate it first");
    }

    function _minOut(uint256 amountIn) internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = usdc;
        path[1] = wavax;
        return IRouterQuote(router).getAmountsOut(amountIn, path)[1] * 99 / 100; // 1% slippage
    }

    function _swap(uint256 amountIn, uint256 minOut) internal {
        vm.prank(agent);
        module.executeGuardedSwap(usdc, wavax, amountIn, minOut, block.timestamp + 5 minutes);
    }

    function test_fork_agentSwapsThroughTheRealPool_exactApprovalThenZero() public {
        uint256 amountIn = 10e6;
        uint256 minOut = _minOut(amountIn);
        uint256 usdcBefore = IERC20(usdc).balanceOf(safe);
        uint256 wavaxBefore = IERC20(wavax).balanceOf(safe);
        uint256 spentBefore = module.spentToday(usdc);

        _swap(amountIn, minOut);

        assertEq(IERC20(usdc).balanceOf(safe), usdcBefore - amountIn, "Safe paid exactly amountIn");
        assertGe(IERC20(wavax).balanceOf(safe) - wavaxBefore, minOut, "Safe received at least minOut");
        assertEq(IERC20(usdc).allowance(safe, router), 0, "no allowance left to the router (C5)");
        assertEq(module.spentToday(usdc), spentBefore + amountIn, "budget counted");
    }

    function test_fork_overPerTxCapRevertsOnChain() public {
        (uint128 maxPerTx,) = module.limits(usdc);
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.ExceedsPerTxCap.selector);
        module.executeGuardedSwap(usdc, wavax, uint256(maxPerTx) + 1, 1, block.timestamp + 5 minutes);
    }

    function test_fork_strangerCannotSwapOrUseTheSafe() public {
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(IAgentPolicyModule.UnauthorizedAgent.selector);
        module.executeGuardedSwap(usdc, wavax, 10e6, 1, block.timestamp + 5 minutes);

        // The real Safe: only enabled modules may call this (GS104).
        vm.prank(attacker);
        vm.expectRevert(bytes("GS104"));
        ISafe(safe)
            .execTransactionFromModule(usdc, 0, abi.encodeCall(IERC20.transfer, (attacker, 1e6)), ISafe.Operation.Call);
        assertEq(IERC20(usdc).balanceOf(attacker), 0);
    }

    function test_fork_killSwitchStopsTheAgentAndReactivationRestoresIt() public {
        vm.prank(owner);
        module.revoke();
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.PolicyInactive.selector);
        module.executeGuardedSwap(usdc, wavax, 10e6, 1, block.timestamp + 5 minutes);

        // Re-activate with the same limits, as the web's "Re-activate" does.
        (address agentSigner, address r,,) = module.policy();
        address[] memory tokens = module.whitelistedTokens();
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            (uint128 maxPerTx, uint128 dailyCap) = module.limits(tokens[i]);
            l[i] = IAgentPolicyModule.Limits(maxPerTx, dailyCap);
        }
        uint256 epoch = module.policyEpoch();
        vm.prank(owner);
        module.setPolicy(IAgentPolicyModule.Policy(agentSigner, r, uint64(block.timestamp + 7 days), true), tokens, l);
        assertEq(module.policyEpoch(), epoch + 1);
        assertEq(module.spentToday(usdc), 0, "new epoch, fresh budget (D10)");

        _swap(10e6, _minOut(10e6));
    }
}
