import { describe, expect, it } from "vitest";
import { state } from "@/test/apiFixtures";
import { buildSetPolicyArgs, policyTokensIn, setPolicyBlocker, type ModuleChainState, type PolicyInput } from "./policy";

const AGENT = "0x5555555555555555555555555555555555555555";
const ROUTER = "0x9999999999999999999999999999999999999999";
const ZERO = "0x0000000000000000000000000000000000000000";
const chain: ModuleChainState = { owner: "0x7777777777777777777777777777777777777777", policy: { agentSigner: AGENT, router: ROUTER, expiry: 1_900_000_000, isActive: false }, epoch: 3n };
const input: PolicyInput = { usdcMaxPerTx: 500_000_000n, usdcDailyCap: 1_500_000_000n, wavaxMaxPerTx: 2n * 10n ** 18n, wavaxDailyCap: 6n * 10n ** 18n, expiry: 1_800_000_000 };
const tokens = { usdc: "0x3333333333333333333333333333333333333333", wavax: "0x4444444444444444444444444444444444444444" } as const;

describe("policyTokensIn", () => {
  it("takes the real token addresses from the chain-sourced balances", () => {
    expect(policyTokensIn(state)).toEqual(tokens);
  });
  it("never guesses an address when a token is missing", () => {
    expect(policyTokensIn({ ...state, balances: state.balances.filter((b) => b.symbol !== "WAVAX") })).toBeNull();
  });
});

describe("buildSetPolicyArgs", () => {
  it("keeps the chain's agent and router, re-activates, and passes bigint base units in token order", () => {
    const [policy, list, limits] = buildSetPolicyArgs(chain, tokens, input);
    expect(policy).toEqual({ agentSigner: AGENT, router: ROUTER, expiry: 1_800_000_000n, isActive: true });
    expect(list).toEqual([tokens.usdc, tokens.wavax]);
    expect(limits).toEqual([
      { maxPerTx: 500_000_000n, dailyCap: 1_500_000_000n },
      { maxPerTx: 2n * 10n ** 18n, dailyCap: 6n * 10n ** 18n },
    ]);
  });
  it("refuses limits the contract would revert with InvalidPolicy", () => {
    expect(() => buildSetPolicyArgs(chain, tokens, { ...input, usdcMaxPerTx: 2_000_000_000n })).toThrow("InvalidPolicy");
    expect(() => buildSetPolicyArgs(chain, tokens, { ...input, wavaxDailyCap: 0n, wavaxMaxPerTx: 0n })).toThrow("InvalidPolicy");
  });
});

describe("setPolicyBlocker", () => {
  const now = 1_700_000_000;
  it("allows a complete policy", () => {
    expect(setPolicyBlocker(chain, tokens, input, now)).toBeNull();
  });
  it("explains what is missing in English", () => {
    expect(setPolicyBlocker(null, tokens, input, now)).toMatch(/Reading the policy/);
    expect(setPolicyBlocker({ ...chain, policy: { ...chain.policy, agentSigner: ZERO } }, tokens, input, now)).toMatch(/no agent yet/);
    expect(setPolicyBlocker(chain, null, input, now)).toMatch(/token addresses/);
    expect(setPolicyBlocker(chain, tokens, { ...input, expiry: now }, now)).toMatch(/future/);
  });
});
