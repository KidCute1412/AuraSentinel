// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {AgentPolicyModule} from "../src/AgentPolicyModule.sol";
import {IAgentPolicyModule} from "../src/interfaces/IAgentPolicyModule.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockRouter} from "./mocks/MockRouter.sol";
import {MockSafe} from "./mocks/MockSafe.sol";
import {PolicyHandler} from "./handlers/PolicyHandler.sol";

/// Stateful fuzzing of the module (contracts.md section 7). The invariant_* names (without the prefix) end up in
/// proof/tests.json and on /proof: run `pnpm proof` after renaming one.
contract AgentPolicyModuleInvariantTest is Test {
    uint256 internal constant DAY_START = 1_700_006_400; // UTC midnight

    MockERC20 internal usdc;
    MockERC20 internal wavax;
    MockSafe internal safe;
    MockRouter internal router;
    AgentPolicyModule internal module;
    PolicyHandler internal handler;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");

    function setUp() public {
        vm.warp(DAY_START + 12 hours);
        usdc = new MockERC20("USDC", 6);
        wavax = new MockERC20("WAVAX", 18);
        safe = new MockSafe(owner);
        router = new MockRouter();
        module = new AgentPolicyModule(address(safe), owner);
        safe.enableModule(address(module));
        usdc.mint(address(safe), 10_000e6);
        wavax.mint(address(safe), 400e18);

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](2);
        l[0] = IAgentPolicyModule.Limits(500e6, 1_500e6);
        l[1] = IAgentPolicyModule.Limits(20e18, 60e18);
        vm.prank(owner);
        module.setPolicy(
            IAgentPolicyModule.Policy(agent, address(router), uint64(block.timestamp + 30 days), true), tokens, l
        );

        handler = new PolicyHandler(module, safe, router, usdc, wavax, owner, agent);

        // Weighted: swaps and attacks dominate; reactivate outweighs revoke so the vault is mostly live.
        bytes4[] memory selectors = new bytes4[](11);
        selectors[0] = PolicyHandler.swap.selector;
        selectors[1] = PolicyHandler.swap.selector;
        selectors[2] = PolicyHandler.swap.selector;
        selectors[3] = PolicyHandler.attack.selector;
        selectors[4] = PolicyHandler.attack.selector;
        selectors[5] = PolicyHandler.warp.selector;
        selectors[6] = PolicyHandler.warp.selector;
        selectors[7] = PolicyHandler.revoke.selector;
        selectors[8] = PolicyHandler.reactivate.selector;
        selectors[9] = PolicyHandler.reactivate.selector;
        selectors[10] = PolicyHandler.routerChaos.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// Spent today never exceeds the daily cap of any whitelisted token.
    function invariant_spentTodayLeCap() public view {
        address[] memory tokens = module.whitelistedTokens();
        for (uint256 i; i < tokens.length; ++i) {
            (, uint128 cap) = module.limits(tokens[i]);
            assertLe(module.spentToday(tokens[i]), cap, "spentToday > dailyCap");
        }
        assertEq(handler.ghostOverCap(), 0, "a swap went over the cap");
    }

    /// No attacker ever holds a token, and no attacker call ever succeeded.
    function invariant_attackerBalanceZero() public view {
        address[3] memory a = handler.attackers();
        for (uint256 i; i < a.length; ++i) {
            assertEq(usdc.balanceOf(a[i]), 0, "attacker has USDC");
            assertEq(wavax.balanceOf(a[i]), 0, "attacker has WAVAX");
        }
        assertEq(handler.ghostAttackerSuccesses(), 0, "an attacker call succeeded");
    }

    /// While the Kill-Switch is on, no swap succeeds and the spend recorded at revoke time does not move.
    function invariant_revokedMeansNoSpend() public view {
        assertEq(handler.ghostSwapsWhileInactive(), 0, "swap succeeded while inactive");
        (,,, bool active) = module.policy();
        if (active) return;
        uint256 day = handler.revokedDay();
        assertEq(module.spentInDay(address(usdc), day), handler.spentAtRevoke(address(usdc)), "USDC spent moved");
        assertEq(module.spentInDay(address(wavax), day), handler.spentAtRevoke(address(wavax)), "WAVAX spent moved");
    }

    /// No allowance from the Safe to the router survives any call (C5).
    function invariant_allowanceZero() public view {
        assertEq(usdc.allowance(address(safe), address(router)), 0, "USDC allowance left");
        assertEq(wavax.allowance(address(safe), address(router)), 0, "WAVAX allowance left");
    }

    /// Every token unit is either in the Safe or in the router: nothing reaches a third address, and every
    /// successful swap paid the Safe at least minOut.
    function invariant_fundsStayInSafeOrRouter() public view {
        assertEq(usdc.balanceOf(address(safe)) + usdc.balanceOf(address(router)), usdc.totalSupply(), "USDC leaked");
        assertEq(wavax.balanceOf(address(safe)) + wavax.balanceOf(address(router)), wavax.totalSupply(), "WAVAX leaked");
        assertEq(handler.ghostShortSwaps(), 0, "Safe got less than minOut");
    }

    function afterInvariant() external view {
        console2.log("swaps ok / reverted", handler.swapsOk(), handler.swapsReverted());
        console2.log("attacks            ", handler.attacks());
        console2.log("warps / day changes", handler.warps(), handler.dayChanges());
        console2.log("revokes / reactiv. ", handler.revokes(), handler.reactivations());
        console2.log("router chaos       ", handler.chaos());
    }
}
