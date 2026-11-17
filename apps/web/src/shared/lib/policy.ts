import type { Address, StateDto } from "@agentshield/shared";
import { sameAddress } from "./address";

/** What the owner fills in on the policy form, already in base units (P5). */
export interface PolicyInput {
  usdcMaxPerTx: bigint;
  usdcDailyCap: bigint;
  wavaxMaxPerTx: bigint;
  wavaxDailyCap: bigint;
  /** Unix seconds. */
  expiry: number;
}

/** The two tokens a policy covers, by their real on-chain addresses. */
export interface PolicyTokens {
  usdc: Address;
  wavax: Address;
}

/** `AgentPolicyModule.policy()` as read from the chain (P1). */
export interface ChainPolicy {
  agentSigner: Address;
  router: Address;
  expiry: number;
  isActive: boolean;
}

/** One module as the chain describes it right now. */
export interface ModuleChainState {
  owner: Address;
  policy: ChainPolicy;
  epoch: bigint;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Token addresses for a real setPolicy, found by symbol in the chain-sourced balances. Never falls back to a made-up
 * address: a wrong token in a signed policy would whitelist something the owner never meant to allow.
 */
export function policyTokensIn(state: StateDto): PolicyTokens | null {
  const find = (symbol: string) => state.balances.find((b) => b.symbol === symbol)?.token ?? null;
  const usdc = find("USDC");
  const wavax = find("WAVAX");
  return usdc && wavax && !sameAddress(usdc, wavax) ? { usdc: usdc as Address, wavax: wavax as Address } : null;
}

/** Why a setPolicy cannot be built from what we know, or null when it can. English, shown under the button. */
export function setPolicyBlocker(chain: ModuleChainState | null, tokens: PolicyTokens | null, input: PolicyInput, nowSec: number): string | null {
  if (!chain) return "Reading the policy from the chain…";
  if (sameAddress(chain.policy.agentSigner, ZERO) || sameAddress(chain.policy.router, ZERO)) return "This vault has no agent yet. Finish the setup first.";
  if (!tokens) return "The token addresses of this vault are not known yet. Try again in a moment.";
  if (input.expiry <= nowSec) return "The expiry must be in the future.";
  return null;
}

/**
 * Arguments of `setPolicy(Policy, address[], Limits[])`. The agent and router stay exactly what the chain holds (the
 * form never edits them); `isActive` is always true, so the same call saves a policy and re-activates after a Kill.
 * Mirrors the contract's own checks so a mistake shows up before the wallet opens.
 */
export function buildSetPolicyArgs(chain: ModuleChainState, tokens: PolicyTokens, input: PolicyInput) {
  const limits = [
    { maxPerTx: input.usdcMaxPerTx, dailyCap: input.usdcDailyCap },
    { maxPerTx: input.wavaxMaxPerTx, dailyCap: input.wavaxDailyCap },
  ];
  for (const l of limits) {
    if (l.maxPerTx <= 0n || l.dailyCap <= 0n || l.maxPerTx > l.dailyCap) throw new Error("InvalidPolicy");
  }
  return [
    { agentSigner: chain.policy.agentSigner, router: chain.policy.router, expiry: BigInt(input.expiry), isActive: true },
    [tokens.usdc, tokens.wavax],
    limits,
  ] as const;
}
