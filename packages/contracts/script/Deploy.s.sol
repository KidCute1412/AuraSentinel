// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentShieldFactory} from "../src/AgentShieldFactory.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockWAVAX} from "../src/MockWAVAX.sol";
import {Deployment, Deployments} from "./lib/Deployments.sol";
import {Fuji} from "./lib/External.sol";

/// Step 1 (L4): MockUSDC + MockWAVAX + AgentShieldFactory. The broadcaster receives the initial supplies.
///   DEPLOYMENT=fuji forge script script/Deploy.s.sol --rpc-url fuji --account deployer --broadcast
/// Refuses to overwrite an existing deployment file unless FORCE=true.
contract Deploy is Script {
    uint256 internal constant USDC_SUPPLY = 1_000_000e6;
    uint256 internal constant USDC_FAUCET = 5_000e6;
    uint256 internal constant WAVAX_SUPPLY = 100_000e18;
    uint256 internal constant WAVAX_FAUCET = 200e18;
    uint256 internal constant COOLDOWN = 1 hours;

    function run() external returns (Deployment memory d) {
        require(block.chainid == Fuji.CHAIN_ID, "Deploy: not Fuji (or a Fuji fork)");
        require(Fuji.TJ_ROUTER.code.length > 0, "Deploy: Trader Joe router missing");
        require(!Deployments.exists() || vm.envOr("FORCE", false), "Deploy: deployment file exists, set FORCE=true");

        vm.startBroadcast();
        MockUSDC usdc = new MockUSDC(USDC_SUPPLY, USDC_FAUCET, COOLDOWN);
        MockWAVAX wavax = new MockWAVAX(WAVAX_SUPPLY, WAVAX_FAUCET, COOLDOWN);
        AgentShieldFactory factory = new AgentShieldFactory();
        vm.stopBroadcast();

        d.chainId = block.chainid;
        d.router = Fuji.TJ_ROUTER;
        d.usdc = address(usdc);
        d.wavax = address(wavax);
        d.factory = address(factory);
        Deployments.save(d);

        console2.log("MockUSDC           ", d.usdc);
        console2.log("MockWAVAX          ", d.wavax);
        console2.log("AgentShieldFactory ", d.factory);
    }
}
