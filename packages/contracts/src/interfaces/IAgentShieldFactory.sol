// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Deploys one AgentPolicyModule per Safe (implemented in L3).
/// The caller must be an owner of the Safe, and becomes the module owner (D9).
interface IAgentShieldFactory {
    error NotSafeOwner();
    error ModuleExists();

    /// The indexer (A8) builds the vault registry from this event.
    event ModuleDeployed(address indexed safe, address indexed module, address indexed owner);

    function deployModule(address safe) external returns (address module);
    function moduleOf(address safe) external view returns (address module);
}
