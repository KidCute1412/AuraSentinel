// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentShieldFactory} from "../src/AgentShieldFactory.sol";
import {AgentPolicyModule} from "../src/AgentPolicyModule.sol";
import {IAgentPolicyModule} from "../src/interfaces/IAgentPolicyModule.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {Deployment, Deployments} from "./lib/Deployments.sol";
import {Fuji, ISafeFull, ISafeProxyFactory} from "./lib/External.sol";

/// Step 3 (L4, run once per demo vault): Safe 1/1 owned by the broadcaster -> module via the factory (so the indexer
/// sees ModuleDeployed) -> enableModule -> setPolicy (D15: 500 / 1,500 USDC) -> fund the Safe.
///   DEPLOYMENT=fuji VAULT=public AGENT_ADDRESS=0x... forge script script/CreateVault.s.sol \
///     --rpc-url fuji --account deployer --broadcast
/// VAULT is `public` (always-on demo vault) or `stage` (live demo, reset with setPolicy right before the show).
/// The broadcaster is the owner (D9): it signs enableModule and setPolicy here, from the owner's own machine (P2/P5).
contract CreateVault is Script {
    uint128 internal constant USDC_MAX_TX = 500e6;
    uint128 internal constant USDC_DAILY = 1_500e6;
    // Same value as the USDC caps at 1 WAVAX = 25 USDC (contracts.md section 2).
    uint128 internal constant WAVAX_MAX_TX = 20e18;
    uint128 internal constant WAVAX_DAILY = 60e18;
    uint256 internal constant FUND_USDC = 10_000e6;
    uint256 internal constant FUND_WAVAX = 400e18;
    uint64 internal constant POLICY_TTL = 30 days;

    function run() external returns (Deployment memory d) {
        d = Deployments.load();
        string memory vault = vm.envString("VAULT");
        bool isPublic = keccak256(bytes(vault)) == keccak256("public");
        require(isPublic || keccak256(bytes(vault)) == keccak256("stage"), "CreateVault: VAULT must be public|stage");
        require((isPublic ? d.publicSafe : d.stageSafe) == address(0), "CreateVault: vault already in the file");
        require(d.pair != address(0), "CreateVault: run SetupPool first");

        address agent = vm.envAddress("AGENT_ADDRESS");
        // Change SALT to get a fresh Safe address if one with the same owner/vault was created before.
        uint256 saltNonce = uint256(keccak256(abi.encode("agentshield", vault, vm.envOr("SALT", uint256(0)))));

        vm.startBroadcast();
        address owner = Deployments.broadcaster();
        require(agent != owner, "CreateVault: agent must not be the owner");

        address safe = _createSafe(owner, saltNonce);
        AgentPolicyModule module = AgentPolicyModule(AgentShieldFactory(d.factory).deployModule(safe));
        _enableModule(safe, owner, address(module));
        _setPolicy(module, d, agent);
        IERC20(d.usdc).transfer(safe, vm.envOr("FUND_USDC", FUND_USDC));
        IERC20(d.wavax).transfer(safe, vm.envOr("FUND_WAVAX", FUND_WAVAX));
        vm.stopBroadcast();

        require(ISafeFull(safe).isModuleEnabled(address(module)), "CreateVault: module not enabled");
        require(module.owner() == owner && module.safe() == safe, "CreateVault: module wiring");

        d.agent = agent;
        if (isPublic) {
            d.publicSafe = safe;
            d.publicModule = address(module);
        } else {
            d.stageSafe = safe;
            d.stageModule = address(module);
        }
        Deployments.save(d);

        console2.log("Vault              ", vault);
        console2.log("Safe               ", safe);
        console2.log("AgentPolicyModule  ", address(module));
        console2.log("Owner              ", owner);
        console2.log("Agent              ", agent);
    }

    function _createSafe(address owner, uint256 saltNonce) internal returns (address safe) {
        address[] memory owners = new address[](1);
        owners[0] = owner;
        bytes memory init = abi.encodeCall(
            ISafeFull.setup, (owners, 1, address(0), "", Fuji.SAFE_FALLBACK_HANDLER, address(0), 0, payable(address(0)))
        );
        safe = ISafeProxyFactory(Fuji.SAFE_PROXY_FACTORY).createProxyWithNonce(Fuji.SAFE_L2_SINGLETON, init, saltNonce);
    }

    /// Safe 1/1: the owner sending the tx is its own signature (v = 1, r = owner, "approved by msg.sender").
    function _enableModule(address safe, address owner, address module) internal {
        bytes memory sig = abi.encodePacked(uint256(uint160(owner)), uint256(0), uint8(1));
        bool ok = ISafeFull(safe)
            .execTransaction(
                safe,
                0,
                abi.encodeCall(ISafeFull.enableModule, (module)),
                0,
                0,
                0,
                0,
                address(0),
                payable(address(0)),
                sig
            );
        require(ok, "CreateVault: enableModule failed");
    }

    function _setPolicy(AgentPolicyModule module, Deployment memory d, address agent) internal {
        address[] memory tokens = new address[](2);
        tokens[0] = d.usdc;
        tokens[1] = d.wavax;
        IAgentPolicyModule.Limits[] memory limits = new IAgentPolicyModule.Limits[](2);
        limits[0] = IAgentPolicyModule.Limits({maxPerTx: USDC_MAX_TX, dailyCap: USDC_DAILY});
        limits[1] = IAgentPolicyModule.Limits({maxPerTx: WAVAX_MAX_TX, dailyCap: WAVAX_DAILY});
        module.setPolicy(
            IAgentPolicyModule.Policy({
                agentSigner: agent, router: d.router, expiry: uint64(block.timestamp) + POLICY_TTL, isActive: true
            }),
            tokens,
            limits
        );
    }
}
