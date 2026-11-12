// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// Every address the deploy scripts produce, in one flat JSON file per deployment:
/// `deployments/<DEPLOYMENT>.json` (`fuji` is committed; `fork` and others are gitignored).
/// Each script loads the file, fills its part and writes the whole object back, so steps can be re-run one by one.
struct Deployment {
    uint256 chainId;
    address router;
    address usdc;
    address wavax;
    address factory;
    address pair;
    address agent;
    address publicSafe;
    address publicModule;
    address stageSafe;
    address stageModule;
}

library Deployments {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// DEPLOYMENT must be set explicitly so a fork run can never overwrite the real Fuji file.
    function path() internal view returns (string memory) {
        string memory name = vm.envString("DEPLOYMENT");
        return string.concat(vm.projectRoot(), "/deployments/", name, ".json");
    }

    function exists() internal view returns (bool) {
        return vm.exists(path());
    }

    function load() internal view returns (Deployment memory d) {
        string memory json = vm.readFile(path());
        d.chainId = vm.parseJsonUint(json, ".chainId");
        d.router = vm.parseJsonAddress(json, ".router");
        d.usdc = vm.parseJsonAddress(json, ".usdc");
        d.wavax = vm.parseJsonAddress(json, ".wavax");
        d.factory = vm.parseJsonAddress(json, ".factory");
        d.pair = vm.parseJsonAddress(json, ".pair");
        d.agent = vm.parseJsonAddress(json, ".agent");
        d.publicSafe = vm.parseJsonAddress(json, ".publicSafe");
        d.publicModule = vm.parseJsonAddress(json, ".publicModule");
        d.stageSafe = vm.parseJsonAddress(json, ".stageSafe");
        d.stageModule = vm.parseJsonAddress(json, ".stageModule");
        require(d.chainId == block.chainid, "Deployments: file is for another chain");
    }

    function save(Deployment memory d) internal {
        string memory o = "deployment";
        vm.serializeUint(o, "chainId", d.chainId);
        vm.serializeAddress(o, "router", d.router);
        vm.serializeAddress(o, "usdc", d.usdc);
        vm.serializeAddress(o, "wavax", d.wavax);
        vm.serializeAddress(o, "factory", d.factory);
        vm.serializeAddress(o, "pair", d.pair);
        vm.serializeAddress(o, "agent", d.agent);
        vm.serializeAddress(o, "publicSafe", d.publicSafe);
        vm.serializeAddress(o, "publicModule", d.publicModule);
        vm.serializeAddress(o, "stageSafe", d.stageSafe);
        string memory json = vm.serializeAddress(o, "stageModule", d.stageModule);
        vm.writeJson(json, path());
    }

    /// The address that signs this script's transactions (`--account` / `--private-key`).
    function broadcaster() internal returns (address sender) {
        (, sender,) = vm.readCallers();
    }
}
