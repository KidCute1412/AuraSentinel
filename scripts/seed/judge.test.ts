import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeAgentGas, judgeAllowances, judgeBudget, judgeDemoLimits, judgeMirror, judgePolicyLive, judgePool, judgeSafeFunds, redactUrl } from "./judge.ts";

const NOW = 1_800_000_000; // 2027-01-15 08:00 UTC
const DAY = 86_400;

describe("seed --verify verdicts", () => {
  it("policy: killed or expired fails, expiring soon warns", () => {
    assert.equal(judgePolicyLive(false, NOW + 30 * DAY, NOW).status, "FAIL");
    assert.equal(judgePolicyLive(true, NOW - 1, NOW).status, "FAIL");
    assert.equal(judgePolicyLive(true, NOW + 3 * DAY, NOW).status, "WARN");
    assert.equal(judgePolicyLive(true, NOW + 20 * DAY, NOW).status, "PASS");
  });

  it("limits: the demo numbers pass, anything else warns", () => {
    assert.equal(judgeDemoLimits(500_000_000n, 1_500_000_000n).status, "PASS");
    assert.equal(judgeDemoLimits(400_000_000n, 1_200_000_000n).status, "WARN");
  });

  it("budget: warns when the demo script would run out, and says when it resets", () => {
    const ok = judgeBudget(200_000_000n, 1_500_000_000n, NOW);
    assert.equal(ok.status, "PASS");
    assert.match(ok.detail, /resets in 16 h 0 min/);
    assert.equal(judgeBudget(1_200_000_000n, 1_500_000_000n, NOW).status, "WARN");
    assert.equal(judgeBudget(2_000_000_000n, 1_500_000_000n, NOW).status, "WARN"); // never negative
  });

  it("safe funds and allowances", () => {
    assert.equal(judgeSafeFunds(0n, 0n).status, "FAIL");
    assert.equal(judgeSafeFunds(500_000_000n, 1n).status, "WARN");
    assert.equal(judgeSafeFunds(9_900_000_000n, 400n * 10n ** 18n).status, "PASS");
    assert.equal(judgeAllowances(0n, 0n).status, "PASS");
    assert.equal(judgeAllowances(1n, 0n).status, "FAIL");
  });

  it("agent gas against the server's AGENT_MIN_GAS_WEI", () => {
    const min = 20_000_000_000_000_000n;
    assert.equal(judgeAgentGas(min - 1n, min).status, "FAIL");
    assert.equal(judgeAgentGas(50_000_000_000_000_000n, min).status, "WARN");
    assert.equal(judgeAgentGas(10n ** 18n, min).status, "PASS");
  });

  it("pool depth and price (seeded at 25 USDC per WAVAX)", () => {
    assert.equal(judgePool(400_000_000_000n, 16_000n * 10n ** 18n).status, "PASS");
    assert.match(judgePool(400_000_000_000n, 16_000n * 10n ** 18n).detail, /25\.00 USDC per WAVAX/);
    assert.equal(judgePool(100_000_000_000n, 4_000n * 10n ** 18n).status, "WARN"); // shallow
    assert.equal(judgePool(400_000_000_000n, 12_000n * 10n ** 18n).status, "WARN"); // 33% off
    assert.equal(judgePool(400_000_000_000n, 4_000n * 10n ** 18n).status, "FAIL"); // 100 USDC per WAVAX
    assert.equal(judgePool(0n, 1n).status, "FAIL");
  });

  it("mirror and url redaction", () => {
    assert.equal(judgeMirror("isActive", "true", "true").status, "PASS");
    assert.equal(judgeMirror("isActive", "true", "false").status, "FAIL");
    assert.equal(redactUrl("https://rpc.example.com/ext/bc/C/rpc?key=secret"), "https://rpc.example.com/…");
    assert.equal(redactUrl("http://localhost:8545"), "http://localhost:8545");
  });
});
