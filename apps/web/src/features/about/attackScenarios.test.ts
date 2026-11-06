import { describe, expect, it } from "vitest";
import { route, scenarioById, SCENARIOS } from "./attackScenarios";

describe("route", () => {
  it("lets a valid swap reach the vault", () => {
    const r = route(scenarioById("valid"));
    expect(r.verdict).toBe("approved");
    expect(r.stopsAt).toBe("vault");
    expect(r.path).toEqual(["agent", "shield1", "shield2", "vault"]);
  });

  it("stops oversized transfers and unlimited approvals at shield 1", () => {
    for (const id of ["drain", "approval"] as const) {
      const r = route(scenarioById(id));
      expect(r.verdict).toBe("blocked");
      expect(r.stopsAt).toBe("shield1");
      expect(r.path).toEqual(["agent", "shield1"]);
    }
    expect(route(scenarioById("drain")).code).toBe("ExceedsPerTxCap");
    expect(route(scenarioById("approval")).code).toBe("UnlimitedApproval");
  });

  it("lets a website bypass slip past shield 1 but dies at shield 2", () => {
    const r = route(scenarioById("direct"));
    expect(r.stopsAt).toBe("shield2");
    expect(r.skipped).toEqual(["shield1"]);
    expect(r.decidedBy).toBe("Shield 2 · Policy contract");
  });

  it("has unique ids and never ends anywhere but a shield or the vault", () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) expect(["shield1", "shield2", "vault"]).toContain(route(s).stopsAt);
  });
});
