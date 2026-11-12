// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Third-party contracts the deploy scripts talk to. Scripts only: none of this ends up in src/ or the ABIs.

/// Addresses on Avalanche Fuji (chain 43113), read from the chain on 12/11/2026:
/// router.factory() == TJ_FACTORY, router.WAVAX() == real WAVAX; Safe v1.4.1 canonical deployments have code.
library Fuji {
    uint256 internal constant CHAIN_ID = 43113;
    address internal constant TJ_ROUTER = 0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901;
    address internal constant TJ_FACTORY = 0xF5c7d9733e5f53abCC1695820c4818C59B457C2C;
    address internal constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762; // SafeL2 v1.4.1
    address internal constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67; // v1.4.1
    address internal constant SAFE_FALLBACK_HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99; // v1.4.1
}

interface IJoeRouter {
    function factory() external view returns (address);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
}

interface IJoeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

interface IJoePair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
}

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafeFull {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;

    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external payable returns (bool success);

    function enableModule(address module) external;
    function isModuleEnabled(address module) external view returns (bool);
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
}
