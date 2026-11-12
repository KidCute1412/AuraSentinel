// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPolicyModule} from "../../src/AgentPolicyModule.sol";
import {IAgentPolicyModule} from "../../src/interfaces/IAgentPolicyModule.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockRouter} from "../mocks/MockRouter.sol";
import {MockSafe} from "../mocks/MockSafe.sol";

/// Drives AgentPolicyModule through random sequences for the invariant suite (contracts.md section 7):
/// agent swaps in both directions (in and over the caps), time jumps across UTC midnight, Kill-Switch and
/// re-activation with new caps, a misbehaving router, and attackers trying every entry point.
/// Every call is wrapped in try/catch: a revert is a valid outcome, the invariants judge the resulting state.
contract PolicyHandler is Test {
    /// MockRouter rates (tokenOut raw units per tokenIn raw unit, scaled by 1e18) at 1 WAVAX = 25 USDC.
    uint256 internal constant RATE_USDC_TO_WAVAX = 5e28;
    uint256 internal constant RATE_WAVAX_TO_USDC = 25e6;
    uint64 internal constant POLICY_TTL = 30 days;

    AgentPolicyModule public immutable module;
    MockSafe public immutable safe;
    MockRouter public immutable router;
    MockERC20 public immutable usdc;
    MockERC20 public immutable wavax;
    address public immutable owner;
    address public immutable agent;
    address[3] internal _attackers;

    // ------------------------------------------------------------------ ghosts

    /// Successful swaps while the policy was inactive. Must stay 0.
    uint256 public ghostSwapsWhileInactive;
    /// Attacker calls that did not revert. Must stay 0.
    uint256 public ghostAttackerSuccesses;
    /// Successful swaps where the Safe received less than minOut. Must stay 0.
    uint256 public ghostShortSwaps;
    /// Successful swaps whose spentToday went over the cap at that moment. Must stay 0.
    uint256 public ghostOverCap;

    /// Snapshot taken at the last Kill-Switch: UTC day and spentInDay per token for that day.
    uint256 public revokedDay;
    mapping(address token => uint256) public spentAtRevoke;

    // Call statistics, printed by afterInvariant so a run that only ever reverts is visible.
    uint256 public swapsOk;
    uint256 public swapsReverted;
    uint256 public attacks;
    uint256 public warps;
    uint256 public dayChanges;
    uint256 public revokes;
    uint256 public reactivations;
    uint256 public chaos;

    constructor(
        AgentPolicyModule module_,
        MockSafe safe_,
        MockRouter router_,
        MockERC20 usdc_,
        MockERC20 wavax_,
        address owner_,
        address agent_
    ) {
        module = module_;
        safe = safe_;
        router = router_;
        usdc = usdc_;
        wavax = wavax_;
        owner = owner_;
        agent = agent_;
        _attackers = [makeAddr("attacker1"), makeAddr("attacker2"), makeAddr("attacker3")];
    }

    function attackers() external view returns (address[3] memory) {
        return _attackers;
    }

    // ------------------------------------------------------------------ agent

    /// Agent swap. `amount` goes up to twice maxPerTx so the cap gates are hit as often as the happy path.
    function swap(bool usdcIn, uint256 amount, uint256 minOutBps, uint256 deadlineOffset) external {
        (MockERC20 tIn, MockERC20 tOut, uint256 rate) =
            usdcIn ? (usdc, wavax, RATE_USDC_TO_WAVAX) : (wavax, usdc, RATE_WAVAX_TO_USDC);
        (uint128 maxPerTx,) = module.limits(address(tIn));
        // 3 in 4 swaps are well-formed (within maxPerTx, sane minOut and deadline) so the state actually moves;
        // the rest go up to 2 x maxPerTx, minOut 0 or above the quote, deadline past the 10 minute window.
        bool wellFormed = amount % 4 != 0;
        amount = _bound(amount, wellFormed ? 1 : 0, uint256(maxPerTx) * (wellFormed ? 1 : 2));
        uint256 minOut =
            (amount * rate / 1e18) * _bound(minOutBps, wellFormed ? 1 : 0, wellFormed ? 9_000 : 10_000) / 10_000;
        uint256 deadline = block.timestamp + _bound(deadlineOffset, 0, wellFormed ? 10 minutes : 20 minutes);

        router.setRate(rate);
        (,,, bool active) = module.policy();
        uint256 outBefore = tOut.balanceOf(address(safe));

        vm.prank(agent);
        try module.executeGuardedSwap(address(tIn), address(tOut), amount, minOut, deadline) {
            ++swapsOk;
            if (!active) ++ghostSwapsWhileInactive;
            if (tOut.balanceOf(address(safe)) - outBefore < minOut) ++ghostShortSwaps;
            (, uint128 cap) = module.limits(address(tIn));
            if (module.spentToday(address(tIn)) > cap) ++ghostOverCap;
        } catch {
            ++swapsReverted;
        }
    }

    // ------------------------------------------------------------------ attacker

    /// An attacker tries one way in. None of them may succeed.
    function attack(uint256 actorSeed, uint256 kind, uint256 amount) external {
        address actor = _attackers[actorSeed % _attackers.length];
        amount = _bound(amount, 1, 1_000_000e18);
        ++attacks;
        kind %= 6;

        vm.prank(actor);
        if (kind == 0) {
            // Swap as if it were the agent.
            try module.executeGuardedSwap(address(usdc), address(wavax), amount, 1, block.timestamp + 1 minutes) {
                ++ghostAttackerSuccesses;
            } catch {}
        } else if (kind == 1) {
            // Make itself the agent.
            (address[] memory tokens, IAgentPolicyModule.Limits[] memory l) = _defaultLimits();
            try module.setPolicy(
                IAgentPolicyModule.Policy(actor, address(router), uint64(block.timestamp + 1 days), true), tokens, l
            ) {
                ++ghostAttackerSuccesses;
            } catch {}
        } else if (kind == 2) {
            // Kill the vault (griefing).
            try module.revoke() {
                ++ghostAttackerSuccesses;
            } catch {}
        } else if (kind == 3) {
            // Call the Safe directly as if it were a module (GS104).
            try safe.execTransactionFromModule(
                address(usdc), 0, abi.encodeCall(MockERC20.transfer, (actor, amount)), 0
            ) returns (
                bool ok
            ) {
                if (ok) {
                    ++ghostAttackerSuccesses;
                }
            } catch {}
        } else if (kind == 4) {
            // Pull USDC out of the Safe through a leftover allowance.
            try usdc.transferFrom(address(safe), actor, amount) {
                ++ghostAttackerSuccesses;
            } catch {}
        } else {
            // Same for WAVAX.
            try wavax.transferFrom(address(safe), actor, amount) {
                ++ghostAttackerSuccesses;
            } catch {}
        }
    }

    // ------------------------------------------------------------------ time

    /// Jump forward up to one day, so most sequences cross UTC midnight at least once.
    function warp(uint256 secs) external {
        secs = _bound(secs, 0, 1 days);
        uint256 dayBefore = block.timestamp / 1 days;
        vm.warp(block.timestamp + secs);
        ++warps;
        if (block.timestamp / 1 days != dayBefore) ++dayChanges;
    }

    // ------------------------------------------------------------------ owner

    /// Kill-Switch. Records today's spend so the suite can check nothing moves while inactive.
    function revoke() external {
        vm.prank(owner);
        module.revoke();
        ++revokes;
        revokedDay = block.timestamp / 1 days;
        spentAtRevoke[address(usdc)] = module.spentInDay(address(usdc), revokedDay);
        spentAtRevoke[address(wavax)] = module.spentInDay(address(wavax), revokedDay);
    }

    /// Owner re-activates (or just edits) the policy with new caps: new epoch, fresh budget, new expiry.
    function reactivate(uint256 usdcMaxTx, uint256 usdcCap, uint256 wavaxMaxTx, uint256 wavaxCap) external {
        usdcMaxTx = _bound(usdcMaxTx, 1, 1_000e6);
        usdcCap = _bound(usdcCap, usdcMaxTx, 5_000e6);
        wavaxMaxTx = _bound(wavaxMaxTx, 1, 40e18);
        wavaxCap = _bound(wavaxCap, wavaxMaxTx, 200e18);

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](2);
        l[0] = IAgentPolicyModule.Limits(uint128(usdcMaxTx), uint128(usdcCap));
        l[1] = IAgentPolicyModule.Limits(uint128(wavaxMaxTx), uint128(wavaxCap));

        vm.prank(owner);
        module.setPolicy(
            IAgentPolicyModule.Policy(agent, address(router), uint64(block.timestamp) + POLICY_TTL, true), tokens, l
        );
        ++reactivations;
    }

    // ------------------------------------------------------------------ hostile router

    /// 1: always fails, 2: pays less than quoted (and rejects minOut), 3: pulls only part of the allowance,
    /// 4: lies, pays less than minOut without reverting (C9), anything else: honest (3 of 7 calls).
    function routerChaos(uint256 mode, uint256 param) external {
        mode %= 7;
        router.setFailSwap(mode == 1);
        router.setShortfallBps(mode == 2 || mode == 4 ? _bound(param, 1, 5_000) : 0);
        router.setIgnoreMinOut(mode == 4);
        router.setPullBps(mode == 3 ? _bound(param, 0, 9_999) : 10_000);
        ++chaos;
    }

    // ------------------------------------------------------------------ helpers

    function _defaultLimits() internal view returns (address[] memory tokens, IAgentPolicyModule.Limits[] memory l) {
        tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        l = new IAgentPolicyModule.Limits[](2);
        l[0] = IAgentPolicyModule.Limits(500e6, 1_500e6);
        l[1] = IAgentPolicyModule.Limits(20e18, 60e18);
    }
}
