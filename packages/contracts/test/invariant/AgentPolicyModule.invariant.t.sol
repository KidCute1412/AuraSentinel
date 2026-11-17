// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPolicyModule} from "../../src/AgentPolicyModule.sol";
import {IAgentPolicyModule} from "../../src/interfaces/IAgentPolicyModule.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockSafe} from "../mocks/MockSafe.sol";
import {MockRouter} from "../mocks/MockRouter.sol";
import {PolicyHandler} from "../handlers/PolicyHandler.sol";

/// Properties of Shield 2 that must hold after ANY sequence of agent swaps, day changes, kills, re-activations and
/// attacker calls (contracts.md section 7, L5). The names are what /proof lists, so keep them readable.
contract AgentPolicyModuleInvariantTest is Test {
    uint256 internal constant DAY_START = 1_700_006_400; // UTC midnight
    /// 1 USDC (1e6) buys 0.05 WAVAX (5e16), as in the unit tests.
    uint256 internal constant RATE = 5e28;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");

    MockERC20 internal usdc;
    MockERC20 internal wavax;
    MockERC20 internal rogue;
    MockSafe internal safe;
    MockRouter internal router;
    AgentPolicyModule internal module;
    PolicyHandler internal handler;

    function setUp() public {
        vm.warp(DAY_START + 12 hours);
        usdc = new MockERC20("USDC", 6);
        wavax = new MockERC20("WAVAX", 18);
        rogue = new MockERC20("ROGUE", 18);
        safe = new MockSafe(owner);
        router = new MockRouter();
        router.setRate(RATE);
        module = new AgentPolicyModule(address(safe), owner);
        safe.enableModule(address(module));

        usdc.mint(address(safe), 1_000_000e6);
        wavax.mint(address(safe), 50_000e18);

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

        handler = new PolicyHandler(module, safe, router, usdc, wavax, rogue, owner, agent);
        targetContract(address(handler));
    }

    /// I1: today's spend of each token never goes over that token's daily cap.
    function invariant_spentNeverExceedsDailyCap() public view {
        assertFalse(handler.ghostSwapOverDailyCap(), "a swap pushed a day over its cap");
        for (uint256 i; i < 2; ++i) {
            address t = i == 0 ? address(usdc) : address(wavax);
            (, uint128 dailyCap) = module.limits(t);
            assertLe(module.spentToday(t), dailyCap, "spentToday > dailyCap");
        }
    }

    /// I2: no single swap is larger than the per-transaction cap.
    function invariant_noSwapExceedsPerTxCap() public view {
        assertFalse(handler.ghostSwapOverPerTx(), "a swap went over maxPerTx");
    }

    /// I3: after a Kill-Switch, nothing is spent until the owner signs a new policy.
    function invariant_revokedMeansNoSpend() public view {
        assertFalse(handler.ghostSwapWhileRevoked(), "a swap succeeded while revoked");
        if (handler.ghostRevoked()) {
            (,,, bool active) = module.policy();
            assertFalse(active, "revoked vault is active again without setPolicy");
        }
    }

    /// I4: no one but the owner changes the policy, and no one but the agent swaps.
    function invariant_onlyOwnerAndAgentCanAct() public view {
        assertFalse(handler.ghostAttackerSucceeded(), "an attacker call succeeded");
    }

    /// I5: attackers never end up holding any token.
    function invariant_attackerNeverReceivesTokens() public view {
        uint256 n = handler.attackerCount();
        for (uint256 i; i < n; ++i) {
            address a = handler.attackers(i);
            assertEq(usdc.balanceOf(a), 0, "attacker holds USDC");
            assertEq(wavax.balanceOf(a), 0, "attacker holds WAVAX");
            assertEq(usdc.allowance(address(safe), a), 0, "attacker has a USDC allowance");
        }
    }

    /// I6: funds only ever sit in the Safe or in the pool it swapped with; nothing leaks anywhere else.
    function invariant_fundsOnlyInSafeOrPool() public view {
        assertEq(
            usdc.balanceOf(address(safe)) + usdc.balanceOf(address(router)),
            handler.ghostExpectedTotal(address(usdc)),
            "USDC left the Safe/pool"
        );
        assertEq(
            wavax.balanceOf(address(safe)) + wavax.balanceOf(address(router)),
            handler.ghostExpectedTotal(address(wavax)),
            "WAVAX left the Safe/pool"
        );
        assertEq(usdc.balanceOf(address(module)) + wavax.balanceOf(address(module)), 0, "module holds tokens");
    }

    /// I7: no allowance from the Safe to the router survives a swap (C5).
    function invariant_noAllowanceLeftToRouter() public view {
        assertEq(usdc.allowance(address(safe), address(router)), 0, "USDC allowance left");
        assertEq(wavax.allowance(address(safe), address(router)), 0, "WAVAX allowance left");
    }

    /// Shows the run actually exercised the system (forge test -vv). Not a property.
    function afterInvariant() public {
        emit log_named_uint("swaps ok", handler.ghostSwaps());
        emit log_named_uint("swaps reverted", handler.ghostReverts());
        emit log_named_uint("kills", handler.ghostKills());
        emit log_named_uint("re-activations", handler.ghostReactivations());
        emit log_named_uint("attackers", handler.attackerCount());
    }
}
