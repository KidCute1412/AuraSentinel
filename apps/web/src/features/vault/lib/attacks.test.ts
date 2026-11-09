import { describe, expect, it } from "vitest";
import { ATTACK_EXPECTATIONS, AttackScenario, type JobDetailDto } from "@agentshield/shared";
import { checkOutcome, expectationLine, expectationSentence } from "./attacks";

type Ended = Pick<JobDetailDto, "status" | "reasonCode" | "revertError">;
const job = (status: Ended["status"], reasonCode: string | null = null, revertError: string | null = null): Ended => ({ status, reasonCode, revertError });

describe("expectation copy", () => {
  it.each(AttackScenario.options)("%s names its shield and reason in English", (scenario) => {
    const e = ATTACK_EXPECTATIONS[scenario];
    expect(expectationLine(scenario)).toMatch(/^Stopped by (Shield 1|Shield 2|The Safe)/);
    if (e.reasonCode) {
      expect(expectationLine(scenario)).toContain(e.reasonCode);
      expect(expectationSentence(scenario)).toContain(e.reasonCode);
    }
    expect(expectationLine(scenario).includes("on-chain proof")).toBe(e.onchainEvidence);
    expect(expectationSentence(scenario)).not.toMatch(/[ạảãàáâầấậẩẫăằắặẳẵđêềếệểễôồốộổỗơờớợởỡưừứựửữ]/);
  });

  it("says plainly that the injected text has no say", () => {
    expect(expectationLine("prompt-injection")).toContain("text ignored");
    expect(expectationSentence("prompt-injection")).toMatch(/only data/);
  });
});

describe("checkOutcome", () => {
  it("waits for a terminal status", () => {
    expect(checkOutcome(undefined, "bypass")).toEqual({ kind: "pending" });
    for (const status of ["queued", "prechecking", "simulating", "broadcasting"] as const) {
      expect(checkOutcome(job(status), "bypass").kind).toBe("pending");
    }
  });

  it("matches status and reason, reading revertError for on-chain blocks", () => {
    expect(checkOutcome(job("rejected", "ExceedsPerTxCap"), "over-withdraw").kind).toBe("expected");
    expect(checkOutcome(job("reverted", null, "GS104"), "unlimited-approval").kind).toBe("expected");
    expect(checkOutcome(job("reverted", "ExceedsPerTxCap", "ExceedsPerTxCap"), "bypass").kind).toBe("expected");
  });

  it("calls a block by another rule what it is, still a block", () => {
    const r = checkOutcome(job("rejected", "PolicyInactive"), "over-withdraw");
    expect(r).toEqual({ kind: "blocked-other", label: "Blocked by another rule: PolicyInactive" });
    // Right reason at the wrong shield is not "as expected" either.
    expect(checkOutcome(job("rejected", "ExceedsPerTxCap"), "bypass").kind).toBe("blocked-other");
  });

  it("flags an attack that went through, and an infra failure, as unexpected", () => {
    expect(checkOutcome(job("confirmed"), "bypass")).toEqual({ kind: "unexpected", label: "Not blocked: report this as a bug" });
    expect(checkOutcome(job("failed"), "wrong-recipient").kind).toBe("unexpected");
  });
});
