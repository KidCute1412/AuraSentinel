import { describe, expect, it } from "vitest";
import { formatPct, formatTokenAmount } from "./format";

describe("formatTokenAmount", () => {
  it("groups thousands with commas and uses a dot for decimals", () => {
    expect(formatTokenAmount(1_500_000n, 6)).toBe("1.5");
    expect(formatTokenAmount(1_500_000_000n, 6)).toBe("1,500");
    expect(formatTokenAmount(1_234_567_890n, 6)).toBe("1,234.56");
  });

  it("handles 18-decimal tokens exactly", () => {
    expect(formatTokenAmount(20n * 10n ** 18n, 18)).toBe("20");
    expect(formatTokenAmount(10_900_000_000_000_000_000n, 18)).toBe("10.9");
  });

  it("truncates instead of rounding up", () => {
    expect(formatTokenAmount(1_999_999n, 6)).toBe("1.99");
    expect(formatTokenAmount(1_999_999n, 6, 0)).toBe("1");
  });

  it("shows a floor marker for dust and plain zero for zero", () => {
    expect(formatTokenAmount(1n, 6)).toBe("<0.01");
    expect(formatTokenAmount(0n, 6)).toBe("0");
  });

  it("keeps the sign on negative deltas", () => {
    expect(formatTokenAmount(-200_000_000n, 6)).toBe("-200");
  });

  it("stays exact beyond Number.MAX_SAFE_INTEGER", () => {
    expect(formatTokenAmount(123_456_789_012_345_678_901n, 6, 6)).toBe("123,456,789,012,345.678901");
  });
});

describe("formatPct", () => {
  it("uses a decimal point", () => {
    expect(formatPct(13.3)).toBe("13.3%");
    expect(formatPct(100, 0)).toBe("100%");
  });
});
