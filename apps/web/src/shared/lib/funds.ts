import { concat, encodeFunctionData, erc20Abi, pad, parseAbi, zeroAddress, type Address, type Hex } from "viem";

/**
 * Pure builders for the owner's fund moves (L8). Deposit and faucet are plain ERC-20 calls from the owner's wallet;
 * a withdrawal has to go through the Safe itself, because the module can only swap inside it.
 */

/** Safe v1.4.1, the parts a 1-of-1 owner needs to move funds out. */
export const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)",
]);

/** FaucetToken (MockUSDC / MockWAVAX): one drip per cooldown and per wallet. */
export const faucetAbi = parseAbi([
  "function faucet()",
  "function faucetAmount() view returns (uint256)",
  "function faucetCooldown() view returns (uint256)",
  "function lastFaucetAt(address account) view returns (uint256)",
  "error FaucetCooldown(uint256 availableAt)",
]);

/**
 * Safe "approved hash" signature (v = 1): r is the owner's address, s is unused. The Safe accepts it when the owner
 * is the one sending execTransaction (GS025 otherwise), so a 1-of-1 owner moves funds with ONE wallet transaction,
 * no separate EIP-712 signature. 65 bytes: r (32) | s (32) | v (1).
 */
export function approvedHashSignature(owner: Address): Hex {
  return concat([pad(owner, { size: 32 }), pad("0x00", { size: 32 }), "0x01"]);
}

/**
 * Arguments of Safe.execTransaction for "send `amount` of `token` from the Safe to `to`". Plain CALL (operation 0,
 * never DELEGATECALL), no gas refund (gasPrice 0, so nothing can be paid out of the Safe), no safeTxGas (a failing
 * transfer reverts the whole call with GS013 instead of being marked as executed).
 */
export function withdrawArgs(token: Address, to: Address, amount: bigint) {
  if (amount <= 0n) throw new Error("Amount must be greater than zero");
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  return [token, 0n, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, approvedHashSignature(to)] as const;
}

/** When the next faucet drip is allowed (unix seconds), or 0 when it already is. The first one always is. */
export function faucetAvailableAt(lastAt: bigint, cooldown: bigint, nowSec: number): number {
  if (lastAt === 0n) return 0;
  const at = Number(lastAt + cooldown);
  return at > nowSec ? at : 0;
}

/** Who may move funds: an owner of a 1-of-1 Safe (a higher threshold needs co-signers, out of scope here). */
export function fundsBlocker(signer: Address | null, owners: readonly Address[] | null, threshold: bigint | null): string | null {
  if (!owners || threshold === null) return null; // still reading
  if (!signer) return "Connect the owner wallet to move funds.";
  if (!owners.some((o) => o.toLowerCase() === signer.toLowerCase())) return "Only an owner of this vault can move its funds.";
  if (threshold !== 1n) return `This vault needs ${threshold} owner signatures; moving funds from here supports single-owner vaults only.`;
  return null;
}
