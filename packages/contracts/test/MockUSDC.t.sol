// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IMockUSDC} from "../src/interfaces/IMockUSDC.sol";

contract MockUSDCTest is Test {
    uint256 internal constant INITIAL = 1_000_000e6;
    uint256 internal constant FAUCET = 5_000e6;
    uint256 internal constant COOLDOWN = 1 hours;
    uint256 internal constant T0 = 1_700_000_000;

    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    MockUSDC internal usdc;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setUp() public {
        vm.warp(T0);
        vm.prank(deployer);
        usdc = new MockUSDC(INITIAL, FAUCET, COOLDOWN);
    }

    // -------------------------------------------------------------- metadata

    function test_metadata() public view {
        assertEq(usdc.name(), "Mock USDC (AgentShield)");
        assertEq(usdc.symbol(), "USDC");
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.faucetAmount(), FAUCET);
        assertEq(usdc.faucetCooldown(), COOLDOWN);
    }

    function test_initialSupplyGoesToDeployer() public view {
        assertEq(usdc.balanceOf(deployer), INITIAL);
        assertEq(usdc.totalSupply(), INITIAL);
    }

    function test_constructor_zeroInitialSupplyMintsNothing() public {
        MockUSDC t = new MockUSDC(0, FAUCET, COOLDOWN);
        assertEq(t.totalSupply(), 0);
    }

    function test_constructor_revertsOnZeroFaucetAmount() public {
        vm.expectRevert(bytes("MockUSDC: faucet amount 0"));
        new MockUSDC(INITIAL, 0, COOLDOWN);
    }

    // ---------------------------------------------------------------- faucet

    function test_faucet_firstCallMints() public {
        vm.expectEmit(true, true, false, true, address(usdc));
        emit Transfer(address(0), alice, FAUCET);
        vm.prank(alice);
        usdc.faucet();

        assertEq(usdc.balanceOf(alice), FAUCET);
        assertEq(usdc.totalSupply(), INITIAL + FAUCET);
        assertEq(usdc.lastFaucetAt(alice), T0);
    }

    function test_faucet_revertsDuringCooldown() public {
        vm.prank(alice);
        usdc.faucet();

        vm.warp(T0 + 10 minutes);
        vm.expectRevert(abi.encodeWithSelector(IMockUSDC.FaucetCooldown.selector, T0 + COOLDOWN));
        vm.prank(alice);
        usdc.faucet();
    }

    function test_faucet_boundary_oneSecondBeforeReverts() public {
        vm.prank(alice);
        usdc.faucet();

        vm.warp(T0 + COOLDOWN - 1);
        vm.expectRevert(abi.encodeWithSelector(IMockUSDC.FaucetCooldown.selector, T0 + COOLDOWN));
        vm.prank(alice);
        usdc.faucet();
    }

    function test_faucet_boundary_exactlyAtAvailableAtSucceeds() public {
        vm.prank(alice);
        usdc.faucet();

        vm.warp(T0 + COOLDOWN);
        vm.prank(alice);
        usdc.faucet();
        assertEq(usdc.balanceOf(alice), 2 * FAUCET);
        assertEq(usdc.lastFaucetAt(alice), T0 + COOLDOWN);
    }

    function test_faucet_cooldownIsPerAddress() public {
        vm.prank(alice);
        usdc.faucet();
        vm.prank(bob);
        usdc.faucet();
        assertEq(usdc.balanceOf(bob), FAUCET);
    }

    function test_faucet_zeroCooldownAllowsRepeat() public {
        MockUSDC t = new MockUSDC(0, FAUCET, 0);
        vm.startPrank(alice);
        t.faucet();
        t.faucet();
        vm.stopPrank();
        assertEq(t.balanceOf(alice), 2 * FAUCET);
    }

    // ---------------------------------------------------------------- ERC-20

    function test_transfer() public {
        vm.expectEmit(true, true, false, true, address(usdc));
        emit Transfer(deployer, alice, 100e6);
        vm.prank(deployer);
        assertTrue(usdc.transfer(alice, 100e6));
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(deployer), INITIAL - 100e6);
    }

    function test_transfer_revertsOverBalance() public {
        vm.expectRevert(bytes("MockUSDC: balance"));
        vm.prank(alice);
        usdc.transfer(bob, 1);
    }

    function test_transfer_revertsToZero() public {
        vm.expectRevert(bytes("MockUSDC: to zero"));
        vm.prank(deployer);
        usdc.transfer(address(0), 1);
    }

    function test_approve_andTransferFrom_exact() public {
        vm.expectEmit(true, true, false, true, address(usdc));
        emit Approval(deployer, alice, 300e6);
        vm.prank(deployer);
        usdc.approve(alice, 300e6);

        vm.prank(alice);
        usdc.transferFrom(deployer, bob, 300e6);
        assertEq(usdc.balanceOf(bob), 300e6);
        // The module relies on this: an exact approval is fully consumed.
        assertEq(usdc.allowance(deployer, alice), 0);
    }

    function test_transferFrom_revertsOverAllowance() public {
        vm.prank(deployer);
        usdc.approve(alice, 100e6);
        vm.expectRevert(bytes("MockUSDC: allowance"));
        vm.prank(alice);
        usdc.transferFrom(deployer, bob, 100e6 + 1);
    }

    function test_transferFrom_maxAllowanceIsNotInfinite() public {
        vm.prank(deployer);
        usdc.approve(alice, type(uint256).max);
        vm.prank(alice);
        usdc.transferFrom(deployer, bob, 1e6);
        assertEq(usdc.allowance(deployer, alice), type(uint256).max - 1e6);
    }

    function test_approve_resetToZero() public {
        vm.startPrank(deployer);
        usdc.approve(alice, 100e6);
        usdc.approve(alice, 0);
        vm.stopPrank();
        assertEq(usdc.allowance(deployer, alice), 0);
    }

    function testFuzz_faucetNeverMintsTwiceWithinCooldown(uint256 wait) public {
        wait = bound(wait, 0, 3 * COOLDOWN);
        vm.prank(alice);
        usdc.faucet();
        vm.warp(T0 + wait);
        vm.prank(alice);
        if (wait < COOLDOWN) {
            vm.expectRevert(abi.encodeWithSelector(IMockUSDC.FaucetCooldown.selector, T0 + COOLDOWN));
            usdc.faucet();
            assertEq(usdc.balanceOf(alice), FAUCET);
        } else {
            usdc.faucet();
            assertEq(usdc.balanceOf(alice), 2 * FAUCET);
        }
    }
}
