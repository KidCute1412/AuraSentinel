// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {AgentPolicyModule} from "../../src/AgentPolicyModule.sol";
import {IAgentPolicyModule} from "../../src/interfaces/IAgentPolicyModule.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockSafe} from "../mocks/MockSafe.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// Drives AgentPolicyModule with random sequences of what can happen in production: the agent swapping (inside and
/// outside its limits), time passing across days, the owner killing and re-activating, and attackers calling
/// everything they can reach. Ghost state records what actually succeeded so the invariants can judge it.
contract PolicyHandler is CommonBase, StdCheats, StdUtils {
    AgentPolicyModule public immutable module;
    MockSafe public immutable safe;
    MockRouter public immutable router;
    MockERC20 public immutable usdc;
    MockERC20 public immutable wavax;
    MockERC20 public immutable rogue;
    address public immutable owner;
    address public immutable agent;

    /// Everyone who is neither the owner nor the agent and who tried something. Their balances must stay zero.
    address[] public attackers;
    mapping(address => bool) internal isAttacker;

    // ---- ghost state
    /// Initial Safe balance + everything the router paid into the Safe. Safe + router must always hold exactly this.
    mapping(address token => uint256) public ghostExpectedTotal;
    bool public ghostSwapWhileRevoked;
    bool public ghostSwapOverPerTx;
    bool public ghostSwapOverDailyCap;
    bool public ghostAttackerSucceeded;
    bool public ghostRevoked;
    uint256 public ghostSwaps;
    uint256 public ghostReverts;
    uint256 public ghostKills;
    uint256 public ghostReactivations;

    constructor(
        AgentPolicyModule module_,
        MockSafe safe_,
        MockRouter router_,
        MockERC20 usdc_,
        MockERC20 wavax_,
        MockERC20 rogue_,
        address owner_,
        address agent_
    ) {
        module = module_;
        safe = safe_;
        router = router_;
        usdc = usdc_;
        wavax = wavax_;
        rogue = rogue_;
        owner = owner_;
        agent = agent_;
        ghostExpectedTotal[address(usdc_)] = usdc_.balanceOf(address(safe_));
        ghostExpectedTotal[address(wavax_)] = wavax_.balanceOf(address(safe_));
    }

    function attackerCount() external view returns (uint256) {
        return attackers.length;
    }

    // ------------------------------------------------------------------ agent

    /// The agent swaps any amount up to twice the per-tx cap, in either direction. Most succeed; the rest must revert.
    function agentSwap(bool usdcIn, uint256 amount, uint256 minOut) external {
        (MockERC20 tIn, MockERC20 tOut) = usdcIn ? (usdc, wavax) : (wavax, usdc);
        (uint128 maxPerTx, uint128 dailyCap) = module.limits(address(tIn));
        amount = _bound(amount, 1, uint256(maxPerTx) * 2 + 1);
        minOut = _bound(minOut, 1, 10);
        if (tIn.balanceOf(address(safe)) < amount) return; // an empty Safe is not what we are testing

        uint256 day = block.timestamp / 1 days;
        uint256 spentBefore = module.spentInDay(address(tIn), day);
        uint256 outBefore = tOut.balanceOf(address(safe));
        bool active = _isActive();

        vm.prank(agent);
        try module.executeGuardedSwap(address(tIn), address(tOut), amount, minOut, block.timestamp + 5 minutes) {
            ++ghostSwaps;
            ghostExpectedTotal[address(tOut)] += tOut.balanceOf(address(safe)) - outBefore;
            if (!active) ghostSwapWhileRevoked = true;
            if (amount > maxPerTx) ghostSwapOverPerTx = true;
            if (spentBefore + amount > dailyCap || module.spentInDay(address(tIn), day) > dailyCap) {
                ghostSwapOverDailyCap = true;
            }
        } catch {
            ++ghostReverts;
        }
    }

    /// The agent tries to route through a token the owner never allowed. Must always revert.
    function agentSwapRogue(uint256 amount) external {
        amount = _bound(amount, 1, 100e6);
        rogue.mint(address(safe), amount);
        vm.prank(agent);
        try module.executeGuardedSwap(address(rogue), address(usdc), amount, 1, block.timestamp + 5 minutes) {
            ghostAttackerSucceeded = true;
        } catch {}
    }

    // ------------------------------------------------------------------ time

    function warp(uint256 secs) external {
        secs = _bound(secs, 1, 3 days);
        vm.warp(block.timestamp + secs);
    }

    // ------------------------------------------------------------------ owner

    function ownerRevoke() external {
        vm.prank(owner);
        module.revoke();
        ghostRevoked = true;
        ++ghostKills;
    }

    /// A fresh, valid policy with random limits: re-activates after a kill and starts a new budget epoch (D10).
    function ownerSetPolicy(uint256 usdcMax, uint256 usdcDaily, uint256 wavaxMax, uint256 wavaxDaily) external {
        usdcMax = _bound(usdcMax, 1e6, 1_000e6);
        usdcDaily = _bound(usdcDaily, usdcMax, 5_000e6);
        wavaxMax = _bound(wavaxMax, 1e18, 50e18);
        wavaxDaily = _bound(wavaxDaily, wavaxMax, 200e18);
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](2);
        l[0] = IAgentPolicyModule.Limits(uint128(usdcMax), uint128(usdcDaily));
        l[1] = IAgentPolicyModule.Limits(uint128(wavaxMax), uint128(wavaxDaily));
        vm.prank(owner);
        module.setPolicy(
            IAgentPolicyModule.Policy(agent, address(router), uint64(block.timestamp + 30 days), true), tokens, l
        );
        ghostRevoked = false;
        ++ghostReactivations;
    }

    // ------------------------------------------------------------------ attackers

    /// Someone who is not the agent calls the swap, with any amount. Must revert and receive nothing.
    function attackerSwap(address caller, uint256 amount, bool usdcIn) external {
        caller = _attacker(caller);
        (MockERC20 tIn, MockERC20 tOut) = usdcIn ? (usdc, wavax) : (wavax, usdc);
        vm.prank(caller);
        try module.executeGuardedSwap(address(tIn), address(tOut), amount, 1, block.timestamp + 1 minutes) {
            ghostAttackerSucceeded = true;
        } catch {}
    }

    /// An attacker tries to take the owner's powers: loosen the policy to point at themselves, or kill the vault.
    function attackerTakeOver(address caller, bool kill) external {
        caller = _attacker(caller);
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](1);
        l[0] = IAgentPolicyModule.Limits(type(uint128).max, type(uint128).max);
        vm.prank(caller);
        if (kill) {
            try module.revoke() {
                ghostAttackerSucceeded = true;
            } catch {}
        } else {
            try module.setPolicy(
                IAgentPolicyModule.Policy(caller, caller, uint64(block.timestamp + 1 days), true), tokens, l
            ) {
                ghostAttackerSucceeded = true;
            } catch {}
        }
    }

    /// An attacker (or the agent itself) asks the Safe directly to transfer or approve tokens to them.
    function attackerDrainSafe(address caller, uint256 amount, bool viaApprove, bool asAgent) external {
        caller = asAgent ? agent : _attacker(caller);
        address receiver = asAgent ? _attacker(address(uint160(uint256(keccak256(abi.encode(amount)))))) : caller;
        bytes memory data = viaApprove
            ? abi.encodeCall(MockERC20.approve, (receiver, type(uint256).max))
            : abi.encodeCall(MockERC20.transfer, (receiver, _bound(amount, 1, 1_000e6)));
        vm.prank(caller);
        try safe.execTransactionFromModule(address(usdc), 0, data, 0) returns (bool ok) {
            if (ok) ghostAttackerSucceeded = true;
        } catch {}
    }

    // ------------------------------------------------------------------ helpers

    function _isActive() internal view returns (bool active) {
        (,,, active) = module.policy();
    }

    /// Any address that is not part of the system becomes a tracked attacker.
    function _attacker(address a) internal returns (address) {
        if (
            a == address(0) || a == owner || a == agent || a == address(module) || a == address(safe)
                || a == address(router) || a == address(this) || a.code.length > 0
        ) {
            a = address(uint160(uint256(keccak256(abi.encode(a, "attacker")))));
        }
        if (!isAttacker[a]) {
            isAttacker[a] = true;
            attackers.push(a);
        }
        return a;
    }
}
