// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {Deployment, Deployments} from "./lib/Deployments.sol";
import {IJoeFactory, IJoePair, IJoeRouter} from "./lib/External.sol";

/// Step 2 (L4): MockUSDC/MockWAVAX pool on Trader Joe V1 at 1 WAVAX = 25 USDC.
///   DEPLOYMENT=fuji forge script script/SetupPool.s.sol --rpc-url fuji --account deployer --broadcast
/// 400,000 USDC + 16,000 WAVAX: a 500 USDC swap moves the price ~0.25%, and one faucet drip (5,000 USDC) ~2.5%.
/// LP tokens go to the broadcaster. Re-running adds more liquidity at the current price.
contract SetupPool is Script {
    uint256 internal constant USDC_LIQUIDITY = 400_000e6;
    uint256 internal constant WAVAX_LIQUIDITY = 16_000e18;

    function run() external returns (Deployment memory d) {
        d = Deployments.load();
        IJoeRouter router = IJoeRouter(d.router);

        uint256 usdcIn = vm.envOr("POOL_USDC", USDC_LIQUIDITY);
        uint256 wavaxIn = vm.envOr("POOL_WAVAX", WAVAX_LIQUIDITY);

        vm.startBroadcast();
        address me = Deployments.broadcaster();
        IERC20(d.usdc).approve(d.router, usdcIn);
        IERC20(d.wavax).approve(d.router, wavaxIn);
        // 1% tolerance only matters when the pool already exists at another price.
        router.addLiquidity(
            d.usdc, d.wavax, usdcIn, wavaxIn, usdcIn * 99 / 100, wavaxIn * 99 / 100, me, block.timestamp + 10 minutes
        );
        vm.stopBroadcast();

        d.pair = IJoeFactory(router.factory()).getPair(d.usdc, d.wavax);
        require(d.pair != address(0), "SetupPool: pair not created");
        Deployments.save(d);

        (uint112 r0, uint112 r1,) = IJoePair(d.pair).getReserves();
        bool usdcIs0 = IJoePair(d.pair).token0() == d.usdc;
        console2.log("Pair               ", d.pair);
        console2.log("Reserve USDC (raw) ", usdcIs0 ? r0 : r1);
        console2.log("Reserve WAVAX (raw)", usdcIs0 ? r1 : r0);
    }
}
