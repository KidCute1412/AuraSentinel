// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentShieldFactory} from "../src/AgentShieldFactory.sol";
import {AgentPolicyModule} from "../src/AgentPolicyModule.sol";
import {IAgentShieldFactory} from "../src/interfaces/IAgentShieldFactory.sol";
import {IAgentPolicyModule} from "../src/interfaces/IAgentPolicyModule.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockSafe} from "./mocks/MockSafe.sol";

/// A "Safe" whose isOwner returns a non-canonical true (2) or nothing at all.
contract WeirdSafe {
    uint256 public mode; // 0 = returns 2, 1 = returns no data

    constructor(uint256 mode_) {
        mode = mode_;
    }

    fallback() external {
        if (mode == 1) return;
        assembly {
            mstore(0, 2)
            return(0, 32)
        }
    }
}

contract AgentShieldFactoryTest is Test {
    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    AgentShieldFactory internal factory;
    MockSafe internal safe;

    event ModuleDeployed(address indexed safe, address indexed module, address indexed owner);

    function setUp() public {
        factory = new AgentShieldFactory();
        safe = new MockSafe(owner);
    }

    function test_deployModule_byOwner() public {
        vm.prank(owner);
        address module = factory.deployModule(address(safe));

        assertTrue(module != address(0));
        assertGt(module.code.length, 0);
        assertEq(factory.moduleOf(address(safe)), module);
        assertEq(AgentPolicyModule(module).owner(), owner);
        assertEq(AgentPolicyModule(module).safe(), address(safe));
        assertEq(AgentPolicyModule(module).policyEpoch(), 0);
    }

    function test_deployModule_emitsModuleDeployed() public {
        // CREATE address of the factory's first deployment (nonce 1).
        address expected = vm.computeCreateAddress(address(factory), 1);
        vm.expectEmit(true, true, true, true, address(factory));
        emit ModuleDeployed(address(safe), expected, owner);
        vm.prank(owner);
        factory.deployModule(address(safe));
    }

    function test_deployModule_revertsForNonOwner() public {
        vm.expectRevert(IAgentShieldFactory.NotSafeOwner.selector);
        vm.prank(stranger);
        factory.deployModule(address(safe));
        assertEq(factory.moduleOf(address(safe)), address(0));
    }

    function test_deployModule_revertsForEoaSafe() public {
        vm.expectRevert(IAgentShieldFactory.NotSafeOwner.selector);
        vm.prank(owner);
        factory.deployModule(owner);
    }

    function test_deployModule_revertsForZeroAddress() public {
        vm.expectRevert(IAgentShieldFactory.NotSafeOwner.selector);
        vm.prank(owner);
        factory.deployModule(address(0));
    }

    function test_deployModule_revertsForContractWithoutIsOwner() public {
        MockERC20 notSafe = new MockERC20("X", 18);
        vm.expectRevert(IAgentShieldFactory.NotSafeOwner.selector);
        vm.prank(owner);
        factory.deployModule(address(notSafe));
    }

    function test_deployModule_revertsWhenIsOwnerReturnsNonCanonicalTrue() public {
        WeirdSafe weird = new WeirdSafe(0);
        vm.expectRevert(IAgentShieldFactory.NotSafeOwner.selector);
        vm.prank(owner);
        factory.deployModule(address(weird));
    }

    function test_deployModule_revertsWhenIsOwnerReturnsNoData() public {
        WeirdSafe weird = new WeirdSafe(1);
        vm.expectRevert(IAgentShieldFactory.NotSafeOwner.selector);
        vm.prank(owner);
        factory.deployModule(address(weird));
    }

    function test_deployModule_revertsWhenModuleExists() public {
        vm.prank(owner);
        address first = factory.deployModule(address(safe));

        vm.expectRevert(IAgentShieldFactory.ModuleExists.selector);
        vm.prank(owner);
        factory.deployModule(address(safe));
        assertEq(factory.moduleOf(address(safe)), first);
    }

    function test_deployModule_otherSafeOwnerCannotRedeploy() public {
        // A second owner of the same Safe cannot replace the module either.
        address coOwner = makeAddr("coOwner");
        MockSafe shared = new MockSafe(owner);
        vm.prank(owner);
        factory.deployModule(address(shared));

        // MockSafe has one owner per constructor; emulate a co-owner by mocking isOwner.
        vm.mockCall(address(shared), abi.encodeWithSignature("isOwner(address)", coOwner), abi.encode(true));
        vm.expectRevert(IAgentShieldFactory.ModuleExists.selector);
        vm.prank(coOwner);
        factory.deployModule(address(shared));
    }

    function test_deployModule_separateSafesGetSeparateModules() public {
        MockSafe other = new MockSafe(owner);
        vm.startPrank(owner);
        address a = factory.deployModule(address(safe));
        address b = factory.deployModule(address(other));
        vm.stopPrank();
        assertTrue(a != b);
        assertEq(factory.moduleOf(address(other)), b);
    }

    function test_moduleOf_unknownSafeIsZero() public view {
        assertEq(factory.moduleOf(address(0xBEEF)), address(0));
    }

    /// End to end: factory module is owned by the caller; only they can set policy, a stranger cannot.
    function test_deployedModule_onlyCallerCanSetPolicy() public {
        vm.prank(owner);
        AgentPolicyModule module = AgentPolicyModule(factory.deployModule(address(safe)));
        safe.enableModule(address(module));

        MockERC20 usdc = new MockERC20("USDC", 6);
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        IAgentPolicyModule.Limits[] memory l = new IAgentPolicyModule.Limits[](1);
        l[0] = IAgentPolicyModule.Limits({maxPerTx: 500e6, dailyCap: 1_500e6});
        IAgentPolicyModule.Policy memory p = IAgentPolicyModule.Policy({
            agentSigner: makeAddr("agent"),
            router: makeAddr("router"),
            expiry: uint64(block.timestamp + 30 days),
            isActive: true
        });

        vm.expectRevert(IAgentPolicyModule.NotOwner.selector);
        vm.prank(stranger);
        module.setPolicy(p, tokens, l);

        vm.prank(owner);
        module.setPolicy(p, tokens, l);
        assertEq(module.policyEpoch(), 1);
    }

    function testFuzz_onlyOwnerCanDeploy(address caller) public {
        vm.assume(caller != owner);
        vm.expectRevert(IAgentShieldFactory.NotSafeOwner.selector);
        vm.prank(caller);
        factory.deployModule(address(safe));
    }
}
