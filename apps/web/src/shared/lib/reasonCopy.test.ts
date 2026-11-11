import { REASONS, REASON_PARAMS, reasonPlaceholders, type ReasonCode } from "@agentshield/shared";
import { describe, expect, it } from "vitest";
import { REASON_COPY, formatReason, reasonTitle } from "./reasonCopy";

const codes = Object.keys(REASONS) as ReasonCode[];

describe("REASON_COPY", () => {
  it("has exactly the shared reason codes", () => {
    expect(Object.keys(REASON_COPY).sort()).toEqual([...codes].sort());
  });

  it.each(codes)("%s uses the same placeholders as the shared template, with a number-free fallback", (code) => {
    const entry = REASON_COPY[code];
    const used = reasonPlaceholders(entry.message);
    expect(new Set(used)).toEqual(new Set(reasonPlaceholders(REASONS[code].messageVi)));
    for (const name of used) expect(REASON_PARAMS).toContain(name);
    if (used.length > 0) {
      expect(entry.fallback, `${code} needs a fallback`).toBeDefined();
      expect(reasonPlaceholders(entry.fallback ?? "")).toEqual([]);
    }
    expect(entry.title).not.toContain("{");
  });
});

describe("formatReason", () => {
  it("fills placeholders with formatted values", () => {
    expect(formatReason("ExceedsPerTxCap", { amount: "2,000 USDC", maxPerTx: "500 USDC" })).toBe(
      "The 2,000 USDC order is over the per-transaction cap of 500 USDC.",
    );
  });

  it("falls back to the number-free sentence when a value is missing", () => {
    expect(formatReason("ExceedsPerTxCap", { amount: "2,000 USDC" })).toBe(REASON_COPY.ExceedsPerTxCap.fallback);
  });

  it("maps unknown codes to UNKNOWN_REVERT", () => {
    expect(formatReason("0xdeadbeef")).toBe(REASON_COPY.UNKNOWN_REVERT.message);
    expect(reasonTitle(null)).toBe("Unknown error");
  });
});
