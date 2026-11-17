import { describe, expect, it } from "vitest";
import { groundId, slug } from "./ground";

describe("ground ids", () => {
  it("turn titles and codes into stable, selector-safe ids", () => {
    expect(slug("Step 1 · Safe")).toBe("step-1-safe");
    expect(slug("  TX FINALITY ")).toBe("tx-finality");
    expect(groundId("panel", "Daily budget")).toBe("panel-daily-budget");
    expect(groundId("vault", "0x5AfE000000000000000000000000000000000001".slice(2, 10))).toBe("vault-5afe0000");
  });
});
