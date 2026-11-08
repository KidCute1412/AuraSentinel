import type { JobStatus } from "@agentshield/shared";
import { describe, expect, it } from "vitest";
import { job, SAFE, state, TX, USDC, WAVAX } from "@/test/apiFixtures";
import { formatPctVi, formatTime, jobView, stageViews, tokenBook } from "./jobView";

const tokens = tokenBook(state);
const overCap = { ...job().intent!, amountIn: "2000000000" };

describe("jobView: one row per status", () => {
  const cases: [JobStatus, { tone: string; stamp: string | null; label: string; decider: string | null }][] = [
    ["queued", { tone: "pending", stamp: null, label: "Đang chờ", decider: null }],
    ["prechecking", { tone: "pending", stamp: null, label: "Shield 1 · kiểm tra", decider: null }],
    ["simulating", { tone: "pending", stamp: null, label: "Shield 1 · chạy thử", decider: null }],
    ["broadcasting", { tone: "pending", stamp: null, label: "Đang gửi lên chain", decider: null }],
    ["confirmed", { tone: "ok", stamp: "APPROVE", label: "Đã khớp", decider: "both" }],
    ["rejected", { tone: "danger", stamp: "BLOCKED", label: "Shield 1 chặn", decider: "shield1" }],
    ["reverted", { tone: "danger", stamp: "BLOCKED", label: "Shield 2 chặn", decider: "shield2" }],
    ["failed", { tone: "warn", stamp: "LỖI", label: "Lỗi hạ tầng", decider: "infra" }],
  ];
  it.each(cases)("%s", (status, want) => {
    const v = jobView(job({ status }), tokens);
    expect({ tone: v.tone, stamp: v.stamp, label: v.statusLabel, decider: v.decider }).toEqual(want);
    expect(v.terminal).toBe(["confirmed", "rejected", "reverted", "failed"].includes(status));
  });
});

describe("jobView: content", () => {
  it("formats the amount and route from chain-sourced token metadata", () => {
    const v = jobView(job({ status: "confirmed" }), tokens);
    expect(v.amount).toBe("200 USDC");
    expect(v.route).toBe("USDC → WAVAX");
    expect(v.title).toBe("Đã khớp lệnh 200 USDC");
    expect(v.reason).toBeNull();
  });

  it("explains a Shield 1 block with the Vietnamese reason", () => {
    const v = jobView(job({ status: "rejected", intent: overCap, reasonCode: "ExceedsPerTxCap" }), tokens);
    expect(v.title).toBe("Shield 1 chặn lệnh 2.000 USDC");
    expect(v.reason).toMatchObject({ code: "ExceedsPerTxCap", title: "Vượt hạn mức mỗi lệnh", raw: null });
    expect(v.reason?.message).toBe("Lệnh vượt hạn mức tối đa cho một lần giao dịch.");
    expect(v.txUrl).toBeNull();
  });

  it("links the reverted Shield 2 tx on Snowtrace and reads revertError", () => {
    const v = jobView(job({ status: "reverted", kind: "attack", origin: "redteam", intent: null, txHash: TX, revertError: "ExceedsPerTxCap" }), tokens);
    expect(v.txUrl).toBe(`https://testnet.snowtrace.io/tx/${TX}`);
    expect(v.title).toBe("Shield 2 chặn lệnh");
    expect(v.origin).toBe("Red-team · tấn công");
    expect(v.amount).toBeNull();
    expect(v.reason?.code).toBe("ExceedsPerTxCap");
  });

  it("prefers the server's explorerUrl when present", () => {
    expect(jobView(job({ status: "reverted", txHash: TX, explorerUrl: "https://example.test/tx/1" }), tokens).txUrl).toBe("https://example.test/tx/1");
  });

  it("keeps an unknown reason code visible instead of hiding it", () => {
    const v = jobView(job({ status: "reverted", reasonCode: "0xdeadbeef" }), tokens);
    expect(v.reason).toMatchObject({ code: "UNKNOWN_REVERT", title: "Lỗi chưa xác định", raw: "0xdeadbeef" });
  });

  it("blocked with no reason at all still has a sentence", () => {
    expect(jobView(job({ status: "rejected" }), tokens).reason?.code).toBe("UNKNOWN_REVERT");
  });

  it("formats huge amounts exactly and unknown tokens as base units", () => {
    const huge = { ...job().intent!, amountIn: "123456789012345678901234567890" };
    expect(jobView(job({ intent: huge }), tokens).amount).toBe("123.456.789.012.345.678.901.234,56 USDC");
    const unknown = { ...job().intent!, tokenIn: SAFE as `0x${string}` };
    expect(jobView(job({ intent: unknown }), new Map()).amount).toBe("200.000.000 đơn vị gốc");
    expect(jobView(job({ intent: unknown }), new Map()).route).toBe("0x1111…1111 → 0x4444…4444");
  });

  it("formats time and percentages for display", () => {
    expect(formatTime("2026-11-09T10:00:00.000Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatTime("nope")).toBe("--:--:--");
    expect(formatPctVi(13.3)).toBe("13,3%");
    expect(formatPctVi(100)).toBe("100%");
  });

  it("token book is keyed case-insensitively", () => {
    expect(tokenBook(state).get(USDC.toUpperCase().toLowerCase())).toEqual({ symbol: "USDC", decimals: 6 });
    expect(tokenBook(state).get(WAVAX)).toEqual({ symbol: "WAVAX", decimals: 18 });
    expect(tokenBook(undefined).size).toBe(0);
  });
});

describe("stageViews", () => {
  it("orders the four stages, marks the failing one and the ones that never ran", () => {
    const ts = "2026-11-09T10:00:01.000Z";
    const stages = stageViews([
      { shield: "precheck", result: "pass", reason: null, ts },
      { shield: "simulation", result: "fail", reason: "ExceedsDailyCap", ts },
    ]);
    expect(stages.map((s) => [s.label, s.result, s.reason])).toEqual([
      ["Shield 1 · precheck", "pass", null],
      ["Shield 1 · chạy thử", "fail", "Vượt hạn mức ngày"],
      ["Shield 1 · invariants", "skipped", null],
      ["Shield 2 · on-chain", "skipped", null],
    ]);
  });
});
