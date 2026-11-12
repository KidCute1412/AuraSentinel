// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPolicyModule} from "../src/AgentPolicyModule.sol";
import {IAgentPolicyModule} from "../src/interfaces/IAgentPolicyModule.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockSafe} from "./mocks/MockSafe.sol";
import {MockRouter} from "./mocks/MockRouter.sol";

/// One test per gate and per custom error, with boundaries (contracts.md section 7).
contract AgentPolicyModuleTest is Test {
    uint256 internal constant DAY_START = 1_700_006_400; // divisible by 1 days (UTC midnight)
    uint256 internal constant USDC_MAX_TX = 500e6;
    uint256 internal constant USDC_DAILY = 1_500e6;
    uint256 internal constant WAVAX_MAX_TX = 20e18;
    uint256 internal constant WAVAX_DAILY = 60e18;
    /// 1 USDC (1e6) buys 0.05 WAVAX (5e16): rate = 5e16 * 1e18 / 1e6.
    uint256 internal constant RATE = 5e28;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal attacker = makeAddr("attacker");

    MockERC20 internal usdc;
    MockERC20 internal wavax;
    MockERC20 internal rogue;
    MockSafe internal safe;
    MockRouter internal router;
    AgentPolicyModule internal module;

    event PolicySet(
        address indexed agentSigner,
        uint256 epoch,
        address router,
        uint64 expiry,
        bool isActive,
        address[] tokens,
        IAgentPolicyModule.Limits[] limits
    );
    event PolicyRevoked(address indexed by, uint64 at);
    event GuardedSwap(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 dayId,
        uint256 spentToday
    );

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

        usdc.mint(address(safe), 10_000e6);
        wavax.mint(address(safe), 1_000e18);

        _setPolicy(uint64(block.timestamp + 30 days), true);
    }

    // ----------------------------------------------------------------- helpers

    function _limits() internal pure returns (address[] memory tokens, IAgentPolicyModule.Limits[] memory l) {
        // tokens are filled by the caller; lengths only
        tokens = new address[](2);
        l = new IAgentPolicyModule.Limits[](2);
    }

    function _setPolicy(uint64 expiry, bool active) internal {
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](2);
        l[0] = IAgentPolicyModule.Limits(uint128(USDC_MAX_TX), uint128(USDC_DAILY));
        l[1] = IAgentPolicyModule.Limits(uint128(WAVAX_MAX_TX), uint128(WAVAX_DAILY));
        vm.prank(owner);
        module.setPolicy(IAgentPolicyModule.Policy(agent, address(router), expiry, active), tokens, l);
    }

    function _swap(uint256 amountIn) internal {
        vm.prank(agent);
        module.executeGuardedSwap(address(usdc), address(wavax), amountIn, 1, block.timestamp + 5 minutes);
    }

    function _swapExpectRevert(bytes4 err, uint256 amountIn) internal {
        vm.expectRevert(err);
        _swap(amountIn);
    }

    // ----------------------------------------------------------------- constructor and views

    function test_constructor_storesSafeAndOwner() public view {
        assertEq(module.safe(), address(safe));
        assertEq(module.owner(), owner);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        new AgentPolicyModule(address(0), owner);
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        new AgentPolicyModule(address(safe), address(0));
    }

    function test_policy_isReadable() public view {
        (address a, address r, uint64 expiry, bool active) = module.policy();
        assertEq(a, agent);
        assertEq(r, address(router));
        assertEq(expiry, uint64(block.timestamp + 30 days));
        assertTrue(active);
        (uint128 maxTx, uint128 cap) = module.limits(address(usdc));
        assertEq(maxTx, USDC_MAX_TX);
        assertEq(cap, USDC_DAILY);
    }

    // ----------------------------------------------------------------- setPolicy / revoke

    function test_setPolicy_onlyOwner() public {
        (address[] memory tokens, IAgentPolicyModule.Limits[] memory l) = _limits();
        vm.prank(attacker);
        vm.expectRevert(IAgentPolicyModule.NotOwner.selector);
        module.setPolicy(
            IAgentPolicyModule.Policy(attacker, address(router), uint64(block.timestamp + 1 days), true), tokens, l
        );
    }

    function test_setPolicy_agentCannotChangeItsOwnPolicy() public {
        (address[] memory tokens, IAgentPolicyModule.Limits[] memory l) = _limits();
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.NotOwner.selector);
        module.setPolicy(
            IAgentPolicyModule.Policy(agent, address(router), uint64(block.timestamp + 1 days), true), tokens, l
        );
    }

    function test_setPolicy_emitsEventWithEpoch() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](1);
        l[0] = IAgentPolicyModule.Limits(10e6, 20e6);
        uint64 expiry = uint64(block.timestamp + 1 days);
        vm.expectEmit(true, false, false, true);
        emit PolicySet(agent, 2, address(router), expiry, true, tokens, l);
        vm.prank(owner);
        module.setPolicy(IAgentPolicyModule.Policy(agent, address(router), expiry, true), tokens, l);
        assertEq(module.policyEpoch(), 2);
    }

    function test_setPolicy_rejectsZeroAgentRouterAndPastExpiry() public {
        (address[] memory tokens, IAgentPolicyModule.Limits[] memory l) = _limits();
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        l[0] = IAgentPolicyModule.Limits(1, 1);
        l[1] = IAgentPolicyModule.Limits(1, 1);
        uint64 ok = uint64(block.timestamp + 1 days);

        vm.startPrank(owner);
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(IAgentPolicyModule.Policy(address(0), address(router), ok, true), tokens, l);
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(IAgentPolicyModule.Policy(agent, address(0), ok, true), tokens, l);
        // expiry must be strictly in the future
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(IAgentPolicyModule.Policy(agent, address(router), uint64(block.timestamp), true), tokens, l);
        vm.stopPrank();
    }

    function test_setPolicy_rejectsBadLimits() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](1);
        IAgentPolicyModule.Policy memory p =
            IAgentPolicyModule.Policy(agent, address(router), uint64(block.timestamp + 1 days), true);

        vm.startPrank(owner);
        l[0] = IAgentPolicyModule.Limits(0, 100); // maxPerTx 0
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(p, tokens, l);
        l[0] = IAgentPolicyModule.Limits(100, 0); // dailyCap 0
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(p, tokens, l);
        l[0] = IAgentPolicyModule.Limits(101, 100); // maxPerTx > dailyCap
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(p, tokens, l);
        vm.stopPrank();
    }

    function test_setPolicy_rejectsLengthMismatchDuplicateZeroTokenAndTooMany() public {
        IAgentPolicyModule.Policy memory p =
            IAgentPolicyModule.Policy(agent, address(router), uint64(block.timestamp + 1 days), true);
        IAgentPolicyModule.Limits memory one = IAgentPolicyModule.Limits(1, 1);

        vm.startPrank(owner);
        // length mismatch
        address[] memory t1 = new address[](1);
        t1[0] = address(usdc);
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(p, t1, new IAgentPolicyModule.Limits[](0));

        // duplicate token
        address[] memory t2 = new address[](2);
        t2[0] = address(usdc);
        t2[1] = address(usdc);
        IAgentPolicyModule.Limits[] memory l2 = new IAgentPolicyModule.Limits[](2);
        l2[0] = one;
        l2[1] = one;
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(p, t2, l2);

        // zero token
        address[] memory t3 = new address[](1);
        IAgentPolicyModule.Limits[] memory l3 = new IAgentPolicyModule.Limits[](1);
        l3[0] = one;
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(p, t3, l3);

        // more than MAX_TOKENS
        uint256 n = module.MAX_TOKENS() + 1;
        address[] memory t4 = new address[](n);
        IAgentPolicyModule.Limits[] memory l4 = new IAgentPolicyModule.Limits[](n);
        for (uint256 i; i < n; ++i) {
            t4[i] = address(uint160(0x1000 + i));
            l4[i] = one;
        }
        vm.expectRevert(IAgentPolicyModule.InvalidPolicy.selector);
        module.setPolicy(p, t4, l4);
        vm.stopPrank();
    }

    function test_setPolicy_dropsTokensMissingFromTheNewList() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](1);
        l[0] = IAgentPolicyModule.Limits(uint128(USDC_MAX_TX), uint128(USDC_DAILY));
        vm.prank(owner);
        module.setPolicy(
            IAgentPolicyModule.Policy(agent, address(router), uint64(block.timestamp + 1 days), true), tokens, l
        );

        (, uint128 wavaxCap) = module.limits(address(wavax));
        assertEq(wavaxCap, 0);
        assertEq(module.whitelistedTokens().length, 1);
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.TokenNotWhitelisted.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), 1e6, 1, block.timestamp + 1 minutes);
    }

    function test_revoke_onlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert(IAgentPolicyModule.NotOwner.selector);
        module.revoke();
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.NotOwner.selector);
        module.revoke();
    }

    function test_revoke_blocksEverySwapAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit PolicyRevoked(owner, uint64(block.timestamp));
        vm.prank(owner);
        module.revoke();
        (,,, bool active) = module.policy();
        assertFalse(active);
        _swapExpectRevert(IAgentPolicyModule.PolicyInactive.selector, 1e6);
    }

    function test_setPolicy_reactivatesAfterRevoke() public {
        vm.prank(owner);
        module.revoke();
        _setPolicy(uint64(block.timestamp + 30 days), true);
        _swap(100e6);
        assertEq(module.spentToday(address(usdc)), 100e6);
    }

    function test_setPolicy_canSaveAnInactivePolicy() public {
        _setPolicy(uint64(block.timestamp + 30 days), false);
        _swapExpectRevert(IAgentPolicyModule.PolicyInactive.selector, 1e6);
    }

    function test_setPolicy_newEpochResetsTodaysBudget() public {
        _swap(USDC_MAX_TX);
        _swap(USDC_MAX_TX);
        _swap(USDC_MAX_TX);
        assertEq(module.spentToday(address(usdc)), USDC_DAILY);
        _swapExpectRevert(IAgentPolicyModule.ExceedsDailyCap.selector, 1);

        _setPolicy(uint64(block.timestamp + 30 days), true); // D10: new policy = new budget
        assertEq(module.spentToday(address(usdc)), 0);
        _swap(USDC_MAX_TX);
        assertEq(module.spentToday(address(usdc)), USDC_MAX_TX);
    }

    // ----------------------------------------------------------------- gate 1

    function test_gate1_unauthorizedAgent() public {
        vm.prank(attacker);
        vm.expectRevert(IAgentPolicyModule.UnauthorizedAgent.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), 1e6, 1, block.timestamp + 1 minutes);
        // The owner is not the agent either.
        vm.prank(owner);
        vm.expectRevert(IAgentPolicyModule.UnauthorizedAgent.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), 1e6, 1, block.timestamp + 1 minutes);
    }

    function test_gate1_policyInactive() public {
        vm.prank(owner);
        module.revoke();
        _swapExpectRevert(IAgentPolicyModule.PolicyInactive.selector, 1e6);
    }

    function test_gate1_policyExpired_boundary() public {
        uint64 expiry = uint64(block.timestamp + 1 hours);
        _setPolicy(expiry, true);

        vm.warp(expiry); // block.timestamp == expiry is still valid
        _swap(1e6);

        vm.warp(uint256(expiry) + 1);
        _swapExpectRevert(IAgentPolicyModule.PolicyExpired.selector, 1e6);
    }

    function test_gate1_runsBeforeEveryOtherGate() public {
        vm.prank(attacker);
        vm.expectRevert(IAgentPolicyModule.UnauthorizedAgent.selector);
        module.executeGuardedSwap(address(rogue), address(rogue), type(uint256).max, 0, type(uint256).max);
    }

    // ----------------------------------------------------------------- gate 2

    function test_gate2_tokenInNotWhitelisted() public {
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.TokenNotWhitelisted.selector);
        module.executeGuardedSwap(address(rogue), address(wavax), 1e18, 1, block.timestamp + 1 minutes);
    }

    function test_gate2_tokenOutNotWhitelisted() public {
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.TokenNotWhitelisted.selector);
        module.executeGuardedSwap(address(usdc), address(rogue), 1e6, 1, block.timestamp + 1 minutes);
    }

    function test_gate2_sameToken() public {
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.SameToken.selector);
        module.executeGuardedSwap(address(usdc), address(usdc), 1e6, 1, block.timestamp + 1 minutes);
    }

    // ----------------------------------------------------------------- gate 3

    function test_gate3_perTxCap_boundary() public {
        _swap(USDC_MAX_TX); // == maxPerTx passes
        _swapExpectRevert(IAgentPolicyModule.ExceedsPerTxCap.selector, USDC_MAX_TX + 1);
    }

    function test_gate3_perTxCapIsPerToken_C1() public {
        // 500 is a fine USDC amount (500e6) but the same raw number on WAVAX is dust: caps are per token.
        vm.prank(agent);
        module.executeGuardedSwap(address(wavax), address(usdc), WAVAX_MAX_TX, 1, block.timestamp + 1 minutes);
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.ExceedsPerTxCap.selector);
        module.executeGuardedSwap(address(wavax), address(usdc), WAVAX_MAX_TX + 1, 1, block.timestamp + 1 minutes);
    }

    function test_gate3_runsBeforeDailyCap() public {
        // 2000 USDC breaks both caps; the per-tx error wins (contracts.md section 4).
        _swapExpectRevert(IAgentPolicyModule.ExceedsPerTxCap.selector, 2_000e6);
    }

    // ----------------------------------------------------------------- gate 4

    function test_gate4_dailyCap_boundary() public {
        _swap(USDC_MAX_TX);
        _swap(USDC_MAX_TX);
        _swap(USDC_MAX_TX - 1); // 1,499.999999 USDC spent
        _swap(1); // exactly 1,500 USDC spent
        assertEq(module.spentToday(address(usdc)), USDC_DAILY);
        _swapExpectRevert(IAgentPolicyModule.ExceedsDailyCap.selector, 1);
    }

    function test_gate4_failedSwapDoesNotConsumeBudget() public {
        router.setFailSwap(true);
        _swapExpectRevert(IAgentPolicyModule.SwapFailed.selector, 100e6);
        assertEq(module.spentToday(address(usdc)), 0);
    }

    function test_gate4_dayRollover_resetsCounter() public {
        _swap(USDC_MAX_TX);
        _swap(USDC_MAX_TX);
        _swap(USDC_MAX_TX);
        _swapExpectRevert(IAgentPolicyModule.ExceedsDailyCap.selector, 1);
        uint256 today = block.timestamp / 1 days;

        vm.warp((today + 1) * 1 days); // 00:00:00 UTC next day
        assertEq(module.spentToday(address(usdc)), 0);
        assertEq(module.spentInDay(address(usdc), today), USDC_DAILY);
        _swap(USDC_MAX_TX);
        assertEq(module.spentToday(address(usdc)), USDC_MAX_TX);
    }

    function test_gate4_lastSecondOfDayStillCountsToday() public {
        uint256 today = block.timestamp / 1 days;
        vm.warp((today + 1) * 1 days - 1);
        _swap(USDC_MAX_TX);
        assertEq(module.spentInDay(address(usdc), today), USDC_MAX_TX);
        assertEq(module.spentToday(address(usdc)), USDC_MAX_TX);
        vm.warp((today + 1) * 1 days);
        assertEq(module.spentToday(address(usdc)), 0);
    }

    function test_gate4_budgetIsPerTokenIn() public {
        _swap(USDC_MAX_TX);
        vm.prank(agent);
        module.executeGuardedSwap(address(wavax), address(usdc), 1e18, 1, block.timestamp + 1 minutes);
        assertEq(module.spentToday(address(usdc)), USDC_MAX_TX);
        assertEq(module.spentToday(address(wavax)), 1e18);
    }

    // ----------------------------------------------------------------- swap parameters

    function test_zeroMinOut() public {
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.ZeroMinOut.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), 1e6, 0, block.timestamp + 1 minutes);
    }

    function test_deadlineTooFar_boundary() public {
        vm.prank(agent);
        module.executeGuardedSwap(address(usdc), address(wavax), 1e6, 1, block.timestamp + 10 minutes); // == window
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.DeadlineTooFar.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), 1e6, 1, block.timestamp + 10 minutes + 1);
    }

    function test_deadlineInThePast_failsInTheRouter() public {
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.SwapFailed.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), 1e6, 1, block.timestamp - 1);
    }

    // ----------------------------------------------------------------- gate 5

    function test_gate5_swapMovesFundsWithinTheSafe() public {
        uint256 usdcBefore = usdc.balanceOf(address(safe));
        uint256 wavaxBefore = wavax.balanceOf(address(safe));
        _swap(100e6); // 100 USDC -> 5 WAVAX

        assertEq(usdc.balanceOf(address(safe)), usdcBefore - 100e6);
        assertEq(wavax.balanceOf(address(safe)), wavaxBefore + 5e18);
        assertEq(usdc.balanceOf(address(module)), 0);
        assertEq(wavax.balanceOf(address(module)), 0);
        assertEq(usdc.balanceOf(agent), 0);
        assertEq(wavax.balanceOf(agent), 0);
    }

    function test_gate5_recipientAndPathAreFixedByTheModule_C2() public {
        _swap(10e6);
        assertEq(router.lastTo(), address(safe));
        assertEq(router.lastPathLength(), 2);
        assertEq(router.lastPath(0), address(usdc));
        assertEq(router.lastPath(1), address(wavax));
    }

    function test_gate5_alwaysCallNeverDelegateCall_C6() public {
        _swap(10e6);
        assertEq(safe.lastOperation(), 0);
        assertEq(safe.calls(), 2); // approve + swap, nothing else
    }

    function test_gate5_noAllowanceLeftAfterSwap_C5() public {
        _swap(100e6);
        assertEq(usdc.allowance(address(safe), address(router)), 0);
    }

    function test_gate5_partialPullAllowanceIsReset_C5() public {
        router.setPullBps(5_000); // router only takes half, leaving 50e6 of allowance
        _swap(100e6);
        assertEq(usdc.allowance(address(safe), address(router)), 0);
    }

    function test_gate5_residualAllowanceReverts_C5() public {
        router.setPullBps(5_000);
        usdc.setStickyApprove(true); // approve(router, 0) silently does nothing
        _swapExpectRevert(IAgentPolicyModule.ResidualAllowance.selector, 100e6);
        assertEq(module.spentToday(address(usdc)), 0); // whole tx rolled back
    }

    function test_gate5_routerEnforcingMinOutSurfacesAsSwapFailed() public {
        // 100 USDC buys 5 WAVAX; asking for 6 makes the honest router revert, which the Safe reports as failure.
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.SwapFailed.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), 100e6, 6e18, block.timestamp + 1 minutes);
    }

    function test_gate5_insufficientOutput_whenRouterIgnoresMinOut_C9() public {
        // A malicious router that pays less than minOut and does not revert.
        EvilRouter evil = new EvilRouter();
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](2);
        l[0] = IAgentPolicyModule.Limits(uint128(USDC_MAX_TX), uint128(USDC_DAILY));
        l[1] = IAgentPolicyModule.Limits(uint128(WAVAX_MAX_TX), uint128(WAVAX_DAILY));
        vm.prank(owner);
        module.setPolicy(
            IAgentPolicyModule.Policy(agent, address(evil), uint64(block.timestamp + 1 days), true), tokens, l
        );
        vm.prank(agent);
        vm.expectRevert(IAgentPolicyModule.InsufficientOutput.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), 100e6, 5e18, block.timestamp + 1 minutes);
    }

    function test_gate5_safeRefusesIfModuleDisabled_GS104() public {
        safe.disableModule(address(module));
        vm.prank(agent);
        vm.expectRevert(bytes("GS104"));
        module.executeGuardedSwap(address(usdc), address(wavax), 1e6, 1, block.timestamp + 1 minutes);
    }

    function test_gate5_reentrancyIsBlocked() public {
        // Make the agent itself the router so the callback comes from the allowed signer.
        ReenteringAgent re = new ReenteringAgent(module, address(usdc), address(wavax));
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](2);
        l[0] = IAgentPolicyModule.Limits(uint128(USDC_MAX_TX), uint128(USDC_DAILY));
        l[1] = IAgentPolicyModule.Limits(uint128(WAVAX_MAX_TX), uint128(WAVAX_DAILY));
        vm.prank(owner);
        module.setPolicy(
            IAgentPolicyModule.Policy(address(re), address(re), uint64(block.timestamp + 1 days), true), tokens, l
        );
        // The inner call must be rejected with Reentrancy while the outer swap still completes.
        re.attack();
        assertTrue(re.sawReentrancy());
        assertEq(module.spentToday(address(usdc)), 1e6); // only the outer swap was counted
    }

    // ----------------------------------------------------------------- events

    function test_emitsGuardedSwap() public {
        uint256 dayId = block.timestamp / 1 days;
        vm.expectEmit(true, true, false, true);
        emit GuardedSwap(address(usdc), address(wavax), 100e6, 5e18, dayId, 100e6);
        _swap(100e6);
        vm.expectEmit(true, true, false, true);
        emit GuardedSwap(address(usdc), address(wavax), 50e6, 2.5e18, dayId, 150e6);
        _swap(50e6);
    }

    // ----------------------------------------------------------------- attacker properties (stateful: invariant suite)

    /// contracts.md section 7: any caller, any amount => the attacker ends with nothing and the vault is untouched.
    /// Tries every way in: swap as the agent, take over the policy, Kill-Switch griefing, act as a module (GS104),
    /// and pull through an allowance.
    function testFuzz_attackerNeverProfits(uint256 amount, address caller) public {
        vm.assume(caller != agent && caller != owner);
        vm.assume(caller != address(safe) && caller != address(module) && caller != address(router));
        assumeNotForgeAddress(caller);
        amount = bound(amount, 1, type(uint128).max);
        uint256 usdcBefore = usdc.balanceOf(address(safe));
        uint256 wavaxBefore = wavax.balanceOf(address(safe));
        (address[] memory tokens, IAgentPolicyModule.Limits[] memory l) = _limits();
        tokens[0] = address(usdc);
        tokens[1] = address(wavax);
        l[0] = IAgentPolicyModule.Limits(type(uint128).max, type(uint128).max);
        l[1] = l[0];

        vm.startPrank(caller);
        vm.expectRevert(IAgentPolicyModule.UnauthorizedAgent.selector);
        module.executeGuardedSwap(address(usdc), address(wavax), amount, 1, block.timestamp + 1 minutes);

        vm.expectRevert(IAgentPolicyModule.NotOwner.selector);
        module.setPolicy(
            IAgentPolicyModule.Policy(caller, address(router), uint64(block.timestamp + 1 days), true), tokens, l
        );

        vm.expectRevert(IAgentPolicyModule.NotOwner.selector);
        module.revoke();

        vm.expectRevert(bytes("GS104"));
        safe.execTransactionFromModule(address(usdc), 0, abi.encodeCall(MockERC20.transfer, (caller, amount)), 0);

        vm.expectRevert();
        usdc.transferFrom(address(safe), caller, amount);
        vm.stopPrank();

        assertEq(usdc.balanceOf(caller), 0);
        assertEq(wavax.balanceOf(caller), 0);
        assertEq(usdc.balanceOf(address(safe)), usdcBefore);
        assertEq(wavax.balanceOf(address(safe)), wavaxBefore);
        (address a,,, bool active) = module.policy();
        assertEq(a, agent);
        assertTrue(active);
    }

    function testFuzz_agentNeverExceedsCaps(uint256 a, uint256 b) public {
        a = bound(a, 1, USDC_MAX_TX);
        b = bound(b, 1, USDC_MAX_TX);
        _swap(a);
        _swap(b);
        assertLe(module.spentToday(address(usdc)), USDC_DAILY);
        assertEq(usdc.allowance(address(safe), address(router)), 0);
    }
}

/// Router that takes the input but pays out less than minOut, without reverting.
contract EvilRouter {
    function swapExactTokensForTokens(uint256 amountIn, uint256, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(path[1]).mint(to, 1);
        amounts = new uint256[](2);
    }
}

/// Plays both the agent and the router: when the module calls the router, it calls the module again.
contract ReenteringAgent {
    AgentPolicyModule internal immutable module;
    address internal immutable tIn;
    address internal immutable tOut;
    bool public sawReentrancy;

    constructor(AgentPolicyModule m, address a, address b) {
        module = m;
        tIn = a;
        tOut = b;
    }

    function attack() external {
        module.executeGuardedSwap(tIn, tOut, 1e6, 1, block.timestamp + 1 minutes);
    }

    function swapExactTokensForTokens(uint256, uint256, address[] calldata, address to, uint256)
        external
        returns (uint256[] memory)
    {
        try module.executeGuardedSwap(tIn, tOut, 1e6, 1, block.timestamp + 1 minutes) {}
        catch (bytes memory reason) {
            sawReentrancy = bytes4(reason) == IAgentPolicyModule.Reentrancy.selector;
        }
        MockERC20(tOut).mint(to, 1); // let the outer swap succeed so the flag survives
        return new uint256[](2);
    }
}
