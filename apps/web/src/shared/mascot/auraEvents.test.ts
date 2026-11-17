import { beforeEach, describe, expect, it, vi } from "vitest";
import { ambient, announce, followTx, registerBlockedAttack, resetAuraEvents, watchPending } from "./auraEvents";
import { isMilestone, isNightHour, LINES, milestoneLine } from "./lines";
import { react, resetMascot, say, useMascot } from "./mascotStore";

describe("aura events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMascot();
    resetAuraEvents();
  });

  it("ambient reactions only play while idle and respect the cooldown", () => {
    expect(ambient("k", 1000, "inspect", { text: "a", hold: 100 })).toBe(true);
    expect(useMascot.getState().mood).toBe("inspect");
    vi.advanceTimersByTime(150);
    expect(ambient("k", 1000, "inspect", { text: "b" })).toBe(false); // cooling down
    vi.advanceTimersByTime(1000);
    react("guard", { hold: 0 });
    expect(ambient("k", 1000, "inspect", { text: "c" })).toBe(false); // busy
    expect(useMascot.getState().mood).toBe("guard");
  });

  it("a skipped ambient reaction does not burn its cooldown", () => {
    react("guard", { hold: 0 });
    expect(ambient("k", 60_000, "happy", {})).toBe(false);
    react("idle", { hold: 0 });
    expect(ambient("k", 60_000, "happy", {})).toBe(true);
  });

  it("shows its line even right after another line", () => {
    say("busy");
    expect(ambient("k", 1000, "inspect", { text: "hi" })).toBe(true);
    expect(useMascot.getState().line?.text).toBe("hi");
  });

  it("may replace a transient feed mood", () => {
    react("alarm", { hold: 0 });
    expect(ambient("k", 1000, "inspect", {})).toBe(true);
  });

  it("stays quiet when Aura-kun is hidden", () => {
    useMascot.setState({ hidden: true });
    expect(ambient("k", 1000, "happy", {})).toBe(false);
  });

  it("announces wallet events", () => {
    announce("wallet:linked");
    expect(useMascot.getState().line?.text).toBe("wallet linked.");
    announce("chain:wrong");
    expect(useMascot.getState().mood).toBe("alarm");
  });

  it("gets worried when a step drags on, and calms down when it ends", () => {
    const stop = watchPending(4000);
    vi.advanceTimersByTime(3999);
    expect(useMascot.getState().mood).toBe("idle");
    vi.advanceTimersByTime(2);
    expect(useMascot.getState().mood).toBe("worry");
    stop();
    expect(useMascot.getState().mood).toBe("idle");
  });

  it("never worries if the step ends in time", () => {
    const stop = watchPending(4000);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(useMascot.getState().mood).toBe("idle");
  });

  it("celebrates blocked-attack milestones only", () => {
    for (let i = 1; i <= 4; i++) registerBlockedAttack();
    expect(useMascot.getState().mood).toBe("idle");
    registerBlockedAttack();
    expect(useMascot.getState().mood).toBe("cheer");
    expect(useMascot.getState().line?.text).toBe("five blocked today.");
  });

  it("milestone and night rules", () => {
    expect([4, 5, 6, 10, 15, 20].map(isMilestone)).toEqual([false, true, false, true, false, true]);
    expect(milestoneLine(30).length).toBeLessThanOrEqual(24);
    expect([21, 22, 3, 4, 5, 12].map(isNightHour)).toEqual([false, true, true, true, false, false]);
  });
});

describe("followTx: a wallet transaction, start to receipt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMascot();
    resetAuraEvents();
  });

  it("confirming cheers (with the caller's line, or the default)", () => {
    const tx = followTx({ cheer: "funded." });
    tx.waiting();
    tx.sent();
    tx.confirmed();
    expect(useMascot.getState().mood).toBe("cheer");
    expect(useMascot.getState().line?.text).toBe("funded.");
  });

  it("a Kill-Switch confirmation puts him on guard instead", () => {
    const tx = followTx({ danger: true });
    tx.confirmed();
    expect(useMascot.getState().mood).toBe("guard");
    expect(useMascot.getState().line?.text).toBe(LINES.tx.locked);
  });

  it("a receipt that takes too long makes him nervous, and the nerves end with it", () => {
    const tx = followTx();
    tx.sent();
    vi.advanceTimersByTime(5100);
    expect(useMascot.getState().mood).toBe("worry");
    tx.confirmed();
    expect(useMascot.getState().mood).toBe("cheer");
  });

  it("a failure alarms him; closing the wallet popup is not an error", () => {
    followTx().failed();
    expect(useMascot.getState().mood).toBe("alarm");
    followTx().declined();
    expect(useMascot.getState().mood).toBe("idle");
    expect(useMascot.getState().line?.text).toBe(LINES.tx.declined);
  });
});

describe("followTx: hop to the card where it happened", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMascot();
    resetAuraEvents();
  });

  it("a confirmed transaction asks Aura-kun to visit that card; one without a card does not", () => {
    followTx().confirmed("panel-funds");
    expect(useMascot.getState().visit).toMatchObject({ id: "panel-funds" });
    const first = useMascot.getState().visit;
    followTx().confirmed();
    expect(useMascot.getState().visit).toBe(first);
    followTx().confirmed("panel-funds");
    expect(useMascot.getState().visit?.n).toBeGreaterThan(first!.n); // a repeat is a new request
  });
});
