import { parseAbi } from 'viem';

/**
 * Hand-written ABI fragments, TEMPORARY until L1 commits the generated ABIs to
 * @agentshield/shared (D5, skill `shared-contract-sync`). They follow contracts.md §3–§5 exactly.
 * A drift here (e.g. a custom error that gains parameters) changes the selector: the call still
 * reverts on-chain, but the decoder reports UNKNOWN_REVERT instead of the real reason.
 */
export const POLICY_MODULE_ABI = parseAbi([
  'function executeGuardedSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)',
  'function policy() view returns (address agentSigner, address router, uint64 expiry, bool isActive)',
  'function limits(address token) view returns (uint128 maxPerTx, uint128 dailyCap)',
  'function spentToday(address token) view returns (uint256)',
  'function whitelistedTokens() view returns (address[])',
  'function policyEpoch() view returns (uint256)',
  'function safe() view returns (address)',
  'function owner() view returns (address)',
  // contracts.md §5: events the indexer reads.
  'event GuardedSwap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 dayId, uint256 spentToday)',
  'event PolicyRevoked(address indexed by, uint64 at)',
  'struct Limits { uint128 maxPerTx; uint128 dailyCap; }',
  'event PolicySet(address indexed agentSigner, uint256 epoch, address router, uint64 expiry, bool isActive, address[] tokens, Limits[] limits)',
  // contracts.md §4: one custom error per gate. Names must match REASONS in shared/errors.ts.
  'error UnauthorizedAgent()',
  'error PolicyInactive()',
  'error PolicyExpired()',
  'error TokenNotWhitelisted()',
  'error SameToken()',
  'error ExceedsPerTxCap()',
  'error ExceedsDailyCap()',
  'error ZeroMinOut()',
  'error DeadlineTooFar()',
  'error SwapFailed()',
  'error InsufficientOutput()',
  'error ResidualAllowance()',
]);

/** Safe ModuleManager. Safe core errors are `Error(string)` with codes like "GS104". */
export const SAFE_MODULE_ABI = parseAbi([
  'function execTransactionFromModule(address to, uint256 value, bytes data, uint8 operation) returns (bool success)',
  'function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)',
]);

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

/** Trader Joe V1 router (UniswapV2-style). Used only to quote minOut for manual rebalances. */
export const ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
]);

/** Module deadline window is 10 minutes (C4); we ask for half of it. */
export const SWAP_DEADLINE_SECONDS = 300n;

/**
 * Manual gas for executeGuardedSwap (Safe approve + router swap + approve reset, with headroom).
 * Manual on purpose: with estimation a Shield 2 revert is caught in the client and never mined,
 * so there is no hash (system-design §5). The simulator uses the same value so an out-of-gas
 * swap fails in the sim first.
 */
export const SWAP_GAS = 700_000n;

export const FACTORY_ABI = parseAbi([
  'event ModuleDeployed(address indexed safe, address indexed module, address indexed owner)',
]);
