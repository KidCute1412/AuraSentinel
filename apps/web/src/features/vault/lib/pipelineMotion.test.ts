import { describe, expect, it } from "vitest";
import { gateAt, isSettled, nextPos, nextStop, shownLook, trackTarget, VAULT_STOP } from "./pipelineMotion";

describe("trackTarget", () => {
  it("lands in the vault when every gate passed", () => {
    expect(trackTarget(["pass", "pass", "pass", "pass"])).toEqual({ stop: VAULT_STOP, blocked: false, halted: false, bypass: false, held: false });
  });
  it("halts behind the gate that stopped it", () => {
    expect(trackTarget(["fail", "skipped", "skipped", "skipped"])).toMatchObject({ stop: 0, blocked: true });
    expect(trackTarget(["pass", "pass", "fail", "skipped"])).toMatchObject({ stop: 2, blocked: true });
  });
  it("waits at the gate that is checking now, and at the start while queued", () => {
    expect(trackTarget(["pass", "active", "pending", "pending"])).toMatchObject({ stop: 1, blocked: false });
    expect(trackTarget(["pending", "pending", "pending", "pending"])).toMatchObject({ stop: 0, blocked: false });
  });
  it("marks an on-chain attack as a bypass stopped by the contract", () => {
    expect(trackTarget(["bypassed", "bypassed", "bypassed", "fail"])).toEqual({ stop: 3, blocked: true, halted: false, bypass: true, held: false });
  });
  it("halts grey, with no barrier, when our side failed", () => {
    expect(trackTarget(["pass", "skipped", "skipped", "skipped"], true)).toEqual({ stop: 1, blocked: false, halted: true, bypass: false, held: false });
  });
  it("parks a held red-team plan in front of the chain, never in the vault", () => {
    expect(trackTarget(["pass", "pass", "pass", "held"])).toEqual({ stop: 3, blocked: false, halted: false, bypass: false, held: true });
    // A direct call the dry run accepted: over the website, then held at the contract.
    expect(trackTarget(["bypassed", "bypassed", "bypassed", "held"])).toEqual({ stop: 3, blocked: false, halted: false, bypass: true, held: true });
  });
});

describe("nextStop", () => {
  it("walks one gate at a time and never past the target", () => {
    expect(nextStop(0, 4, false)).toBe(1);
    expect(nextStop(3, 4, false)).toBe(4);
    expect(nextStop(4, 4, false)).toBe(4);
  });
  it("jumps over the website's three gates on a bypass", () => {
    expect(nextStop(0, 3, true)).toBe(3);
  });
});

describe("nextPos", () => {
  it("checks each gate, then walks on; the last gate answers before the vault", () => {
    const t = trackTarget(["pass", "pass", "pass", "pass"]);
    const steps = [{ stop: 0, revealed: false }];
    while (!isSettled(steps.at(-1)!, t)) steps.push(nextPos(steps.at(-1)!, t));
    expect(steps).toEqual([
      { stop: 0, revealed: false },
      { stop: 1, revealed: false },
      { stop: 2, revealed: false },
      { stop: 3, revealed: false },
      { stop: 4, revealed: true },
    ]);
  });
  it("scans the gate that will block it before the barrier comes down", () => {
    const t = trackTarget(["fail", "skipped", "skipped", "skipped"]);
    expect(nextPos({ stop: 0, revealed: false }, t)).toEqual({ stop: 0, revealed: true });
  });
  it("jumps the website on a bypass, then the contract answers", () => {
    const t = trackTarget(["bypassed", "bypassed", "bypassed", "fail"]);
    expect(nextPos({ stop: 0, revealed: false }, t)).toEqual({ stop: 3, revealed: false });
    expect(nextPos({ stop: 3, revealed: false }, t)).toEqual({ stop: 3, revealed: true });
  });
});

describe("shownLook", () => {
  const target = trackTarget(["pass", "fail", "skipped", "skipped"]);
  it("checks the gate the packet waits at, keeps later gates waiting, and reveals everything once settled", () => {
    expect(shownLook("pass", 0, { stop: 0, revealed: false }, target)).toBe("active");
    expect(shownLook("fail", 1, { stop: 0, revealed: false }, target)).toBe("pending");
    expect(shownLook("pass", 0, { stop: 1, revealed: false }, target)).toBe("pass");
    expect(shownLook("fail", 1, { stop: 1, revealed: false }, target)).toBe("active");
    expect(shownLook("fail", 1, { stop: 1, revealed: true }, target)).toBe("fail");
    expect(shownLook("skipped", 2, { stop: 1, revealed: true }, target)).toBe("skipped");
  });
  it("keeps bypassed gates bypassed the whole way", () => {
    const bypass = trackTarget(["bypassed", "bypassed", "bypassed", "fail"]);
    expect(shownLook("bypassed", 1, { stop: 0, revealed: false }, bypass)).toBe("bypassed");
  });
});

describe("gateAt", () => {
  it("opens the gate at the packet, and the last gate once it is in the vault", () => {
    expect(gateAt(0)).toBe(0);
    expect(gateAt(2)).toBe(2);
    expect(gateAt(VAULT_STOP)).toBe(3);
  });
});
