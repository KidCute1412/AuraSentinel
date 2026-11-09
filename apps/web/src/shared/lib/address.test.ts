import { describe, expect, it } from "vitest";
import { parseAddressParam, sameAddress, shortAddress } from "./address";

const LOWER = "0x7a3f5c9e21b84dd0a6f13c8e92b7064a1c91cd02";

describe("parseAddressParam", () => {
  it("normalises to checksum case", () => {
    const out = parseAddressParam(LOWER);
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).toBe(LOWER);
    expect(out).not.toBe(LOWER);
    expect(parseAddressParam(out!)).toBe(out);
  });

  it("rejects malformed input", () => {
    for (const bad of [undefined, "", "0x123", "not-an-address", LOWER.slice(0, -1), `${LOWER}00`, LOWER.replace("0x", "")]) {
      expect(parseAddressParam(bad)).toBeNull();
    }
  });
});

describe("address helpers", () => {
  it("compares case-insensitively and tolerates missing values", () => {
    expect(sameAddress(LOWER, LOWER.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(sameAddress(LOWER, undefined)).toBe(false);
    expect(sameAddress(null, null)).toBe(false);
  });

  it("shortens for display", () => {
    expect(shortAddress(LOWER)).toBe("0x7a3f…cd02");
  });
});
