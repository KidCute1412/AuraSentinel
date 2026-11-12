// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AgentPolicyModule} from "./AgentPolicyModule.sol";
import {IAgentShieldFactory} from "./interfaces/IAgentShieldFactory.sol";
import {ISafe} from "./interfaces/ISafe.sol";

/// @title AgentShieldFactory
/// @notice Deploys one AgentPolicyModule per Safe. Only an owner of the Safe may call it, and that caller becomes the
///         module owner (D9). The factory has no admin, no upgrade path and holds no funds.
/// @dev The Safe owner still has to `enableModule` and `setPolicy` afterwards (both signed in the browser, P2).
///      The indexer (A8) builds the vault registry from `ModuleDeployed`, so demo vaults must be created here too.
contract AgentShieldFactory is IAgentShieldFactory {
    mapping(address => address) private _moduleOf;

    function moduleOf(address safe) external view returns (address module) {
        return _moduleOf[safe];
    }

    function deployModule(address safe) external returns (address module) {
        // staticcall: a fake "Safe" cannot re-enter or change state, and an EOA / contract without isOwner
        // (empty or short return data) reads as "not an owner" instead of an opaque revert.
        (bool ok, bytes memory ret) = safe.staticcall(abi.encodeCall(ISafe.isOwner, (msg.sender)));
        if (!ok || ret.length < 32 || abi.decode(ret, (uint256)) != 1) revert NotSafeOwner();
        if (_moduleOf[safe] != address(0)) revert ModuleExists();

        module = address(new AgentPolicyModule(safe, msg.sender));
        _moduleOf[safe] = module;
        emit ModuleDeployed(safe, module, msg.sender);
    }
}
