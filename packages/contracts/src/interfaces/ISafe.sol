// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Subset of Safe v1.4.1 used by the module. `Operation` is `uint8` on the wire (Enum.Operation in Safe).
interface ISafe {
    enum Operation {
        Call,
        DelegateCall
    }

    function execTransactionFromModule(address to, uint256 value, bytes calldata data, Operation operation)
        external
        returns (bool success);

    function isOwner(address owner) external view returns (bool);
    function isModuleEnabled(address module) external view returns (bool);
}
