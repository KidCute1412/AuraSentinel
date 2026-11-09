import { describe, expect, it } from "vitest";
import { activeStep, identicon, initialPhase, MOCK_ADDRESS, mockAddressFor, reduce, safeReturnPath, shortAddress, stageOf } from "./gateFlow";

describe("gate flow", () => {
  it("walks connect -> sign -> verify -> done", () => {
    let p = reduce(initialPhase, { type: "pick", wallet: "core" });
    expect(activeStep(p)).toBe("connect");
    p = reduce(p, { type: "connected" });
    expect([activeStep(p), stageOf(p)]).toEqual(["sign", 1]);
    p = reduce(p, { type: "sign" });
    expect([activeStep(p), stageOf(p)]).toEqual(["verify", 2]);
    p = reduce(p, { type: "verified" });
    expect([activeStep(p), stageOf(p)]).toEqual(["done", 3]);
  });

  it("ignores out-of-order actions", () => {
    expect(reduce(initialPhase, { type: "sign" })).toBe(initialPhase);
    expect(reduce(initialPhase, { type: "verified" })).toBe(initialPhase);
  });

  it("rejecting the signature denies, and the wallet can be picked again", () => {
    let p = reduce(initialPhase, { type: "pick", wallet: "metamask" });
    p = reduce(p, { type: "connected" });
    p = reduce(p, { type: "reject" });
    expect(p.kind).toBe("denied");
    expect(reduce(p, { type: "pick", wallet: "core" }).kind).toBe("connecting");
  });

  it("identicon is deterministic and mirrored", () => {
    const a = identicon(MOCK_ADDRESS);
    expect(identicon(MOCK_ADDRESS)).toEqual(a);
    for (const row of a) expect([row[0], row[1]]).toEqual([row[4], row[3]]);
  });

  it("shortens addresses", () => {
    expect(shortAddress(MOCK_ADDRESS)).toBe("0x7A3f…Cd02");
  });
});

describe("safeReturnPath", () => {
  it("accepts same-site paths, keeping query and hash", () => {
    expect(safeReturnPath("/vaults/new/policy")).toBe("/vaults/new/policy");
    expect(safeReturnPath("/vaults/0xabc/activity?status=rejected&page=2#top")).toBe("/vaults/0xabc/activity?status=rejected&page=2#top");
  });

  it("rejects anything that could leave the site or loop", () => {
    for (const bad of [undefined, null, 42, "", "vaults", "//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil.com", "/signin", "/signin?x=1", "/signup"]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
});

describe("mockAddressFor", () => {
  it("gives the new-wallet path a different address from the returning owner", () => {
    expect(mockAddressFor("core")).toBe(MOCK_ADDRESS);
    expect(mockAddressFor("metamask")).not.toBe(MOCK_ADDRESS);
  });
});
