// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Minimal Safe: owners, enabled modules and execTransactionFromModule with the real GS104 behaviour.
contract MockSafe {
    mapping(address => bool) public isOwner;
    mapping(address => bool) public isModuleEnabled;
    /// Operation of the last module call (0 = Call, 1 = DelegateCall); the module must only ever use Call.
    uint8 public lastOperation;
    uint256 public calls;

    constructor(address owner_) {
        isOwner[owner_] = true;
    }

    function enableModule(address module) external {
        isModuleEnabled[module] = true;
    }

    function disableModule(address module) external {
        isModuleEnabled[module] = false;
    }

    function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success)
    {
        require(isModuleEnabled[msg.sender], "GS104");
        lastOperation = operation;
        ++calls;
        (success,) = to.call{value: value}(data);
    }
}
