// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentPolicyModule} from "../src/AgentPolicyModule.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {Deployment, Deployments} from "./lib/Deployments.sol";
import {IJoeRouter} from "./lib/External.sol";

/// Step 4 (L4 acceptance): one guarded swap USDC -> WAVAX signed by the AGENT key, visible on Snowtrace.
///   DEPLOYMENT=fuji VAULT=public forge script script/ManualSwap.s.sol --rpc-url fuji --account agent --broadcast
/// SWAP_USDC (base units, default 100 USDC) must stay within the policy caps. minOut = quote - 1%.
contract ManualSwap is Script {
    uint256 internal constant DEFAULT_AMOUNT = 100e6;

    function run() external {
        Deployment memory d = Deployments.load();
        bool isPublic = keccak256(bytes(vm.envString("VAULT"))) == keccak256("public");
        address safe = isPublic ? d.publicSafe : d.stageSafe;
        AgentPolicyModule module = AgentPolicyModule(isPublic ? d.publicModule : d.stageModule);
        require(address(module) != address(0), "ManualSwap: vault not created");

        uint256 amountIn = vm.envOr("SWAP_USDC", DEFAULT_AMOUNT);
        address[] memory path = new address[](2);
        path[0] = d.usdc;
        path[1] = d.wavax;
        uint256 quote = IJoeRouter(d.router).getAmountsOut(amountIn, path)[1];
        uint256 minOut = quote * 99 / 100;

        uint256 usdcBefore = IERC20(d.usdc).balanceOf(safe);
        uint256 wavaxBefore = IERC20(d.wavax).balanceOf(safe);

        vm.startBroadcast();
        require(Deployments.broadcaster() == d.agent, "ManualSwap: sign with the agent key");
        module.executeGuardedSwap(d.usdc, d.wavax, amountIn, minOut, block.timestamp + 5 minutes);
        vm.stopBroadcast();

        require(IERC20(d.usdc).balanceOf(safe) == usdcBefore - amountIn, "ManualSwap: USDC delta");
        require(IERC20(d.wavax).balanceOf(safe) >= wavaxBefore + minOut, "ManualSwap: WAVAX delta");
        require(IERC20(d.usdc).allowance(safe, d.router) == 0, "ManualSwap: residual allowance");

        console2.log("Swapped USDC (raw) ", amountIn);
        console2.log("Got WAVAX (raw)    ", IERC20(d.wavax).balanceOf(safe) - wavaxBefore);
        console2.log("Spent today (raw)  ", module.spentToday(d.usdc));
    }
}
