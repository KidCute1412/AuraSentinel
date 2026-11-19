import { describe, expect, it } from "vitest";
import { nextStop, shownLook, trackTarget, VAULT_STOP } from "./pipelineMotion";

describe("trackTarget", () => {
  it("lands in the vault when every gate passed", () => {
    expect(trackTarget(["pass", "pass", "pass", "pass"])).toEqual({ stop: VAULT_STOP, blocked: false, halted: false, bypass: false });
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
    expect(trackTarget(["bypassed", "bypassed", "bypassed", "fail"])).toEqual({ stop: 3, blocked: true, halted: false, bypass: true });
  });
  it("halts grey, with no barrier, when our side failed", () => {
    expect(trackTarget(["pass", "skipped", "skipped", "skipped"], true)).toEqual({ stop: 1, blocked: false, halted: true, bypass: false });
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

describe("shownLook", () => {
  const target = trackTarget(["pass", "fail", "skipped", "skipped"]);
  it("keeps gates ahead of the packet waiting, and reveals the stop gate only on arrival", () => {
    expect(shownLook("pass", 0, 0, target)).toBe("pending");
    expect(shownLook("pass", 0, 1, target)).toBe("pass");
    expect(shownLook("fail", 1, 1, target)).toBe("fail");
    expect(shownLook("skipped", 2, 1, target)).toBe("skipped");
    expect(shownLook("skipped", 2, 0, target)).toBe("pending");
  });
});
