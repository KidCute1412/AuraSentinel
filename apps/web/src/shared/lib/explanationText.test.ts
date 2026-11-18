import { describe, expect, it } from "vitest";
import { explanationText } from "./explanationText";

const tpl = { verdict: "safe" as const, budgetUsedPct: 13.3, messageVi: "Giao dịch an toàn.", source: "template" as const };

describe("explanationText", () => {
  it("re-words an approved template row in English with the budget used", () => {
    const shown = explanationText({ status: "confirmed", explanation: tpl });
    expect(shown).toEqual({
      text: "Passed every check and the funds stayed in the vault. 13.3% of today's limit is now used.",
      source: "template",
      budgetUsedPct: 13.3,
    });
  });

  it("uses the English reason sentence for a blocked template row, never the Vietnamese one", () => {
    const shown = explanationText(
      { status: "rejected", reasonCode: "ExceedsPerTxCap", explanation: { ...tpl, verdict: "blocked", messageVi: "Lệnh vượt hạn mức." } },
      { amount: "2,000 USDC" },
    );
    // No maxPerTx value on the client: the number-free English sentence is used.
    expect(shown?.text).toBe("The order is larger than the most the agent may move in one transaction.");
    expect(shown?.text).not.toMatch(/Lệnh/);
  });

  it("explains an on-chain revert that has no explanation row from its revert error", () => {
    const shown = explanationText({ status: "reverted", revertError: "GS104", explanation: null });
    expect(shown).toMatchObject({ source: "rules", budgetUsedPct: null });
    expect(shown?.text).toContain("GS104");
  });

  it("shows LLM text as written", () => {
    expect(explanationText({ status: "confirmed", explanation: { ...tpl, source: "llm", messageVi: "Hi" } })?.text).toBe("Hi");
  });

  it("returns null for a confirmed job still waiting for its explanation, and for failures", () => {
    expect(explanationText({ status: "confirmed", explanation: null })).toBeNull();
    expect(explanationText({ status: "failed", explanation: null })).toBeNull();
  });
});
