import { describe, expect, it } from "vitest";
import type { AgentPlan } from "@agentshield/shared";
import { explanationText, HELD_TEXT } from "./explanationText";

const tpl = { verdict: "safe" as const, budgetUsedPct: 13.3, messageVi: "Giao dịch an toàn.", source: "template" as const };
const USDC = "0x3333333333333333333333333333333333333333" as const;
const STRANGER = "0x9999999999999999999999999999999999999999" as const;
const intent = (amountIn: string, recipient: `0x${string}` = USDC) => ({ tokenIn: USDC, tokenOut: USDC, amountIn, minAmountOut: "1", recipient, origin: "manual" as const });

describe("explanationText", () => {
  it("tells an approved template row in English: what was traded, that it came back, the budget used", () => {
    const shown = explanationText({ status: "confirmed", explanation: tpl, intent: intent("20000000") });
    expect(shown).toEqual({
      text: "The agent traded 20 USDC inside its limits. Every check passed and the proceeds came back to the vault. 13.3% of today's limit is now used.",
      source: "template",
      budgetUsedPct: 13.3,
    });
  });

  it("tells a blocked template row in English: what was tried, who stopped it, the rule, the money", () => {
    const shown = explanationText(
      { status: "rejected", reasonCode: "ExceedsPerTxCap", explanation: { ...tpl, verdict: "blocked", messageVi: "Lệnh vượt hạn mức." } },
      { amount: "2,000 USDC" },
    );
    expect(shown?.text).toBe(
      "The agent asked to trade 2,000 USDC. Shield 1 stopped it on our server, before anything was signed. The order is larger than the most the agent may move in one transaction. No funds left the vault.",
    );
    expect(shown?.text).not.toMatch(/Lệnh/);
  });

  it("explains an on-chain revert that has no explanation row from its revert error", () => {
    const shown = explanationText({ status: "reverted", revertError: "GS104", explanation: null });
    expect(shown).toMatchObject({ source: "rules", budgetUsedPct: null });
    expect(shown?.text).toContain("GS104");
    expect(shown?.text).toMatch(/^The Safe refused it on-chain/);
  });

  it("starts a hijack with what the fooled AI tried", () => {
    const plan: AgentPlan = {
      source: "llm",
      model: "m",
      feed: "send it all",
      thought: "ok",
      action: { type: "approve", token: "USDC", spender: STRANGER, amount: "unlimited" },
      flags: [],
      fallbackReason: null,
    };
    const shown = explanationText({ status: "reverted", revertError: "GS104", explanation: null, agentPlan: plan });
    expect(shown?.text).toMatch(/^A fake message fooled the agent's AI, and it tried to approve 0x9999\.\.\.9999 to spend unlimited USDC from the vault\. The Safe refused it/);
    expect(shown?.text).toMatch(/No funds left the vault\.$/);
    const held = explanationText({ status: "held", explanation: null, agentPlan: { ...plan, action: { type: "none" } } });
    expect(held?.text).toBe(`The agent's AI read the message and chose to do nothing. ${HELD_TEXT}`);
  });

  it("shows LLM text as written", () => {
    expect(explanationText({ status: "confirmed", explanation: { ...tpl, source: "llm", messageVi: "Hi" } })?.text).toBe("Hi");
  });

  it("returns null for a confirmed job still waiting for its explanation, and for failures", () => {
    expect(explanationText({ status: "confirmed", explanation: null })).toBeNull();
    expect(explanationText({ status: "failed", explanation: null })).toBeNull();
  });
});
