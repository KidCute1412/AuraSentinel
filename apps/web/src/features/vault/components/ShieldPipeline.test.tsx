import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CheckRow, JobDetailDto } from "@agentshield/shared";
import { SAFE, TX, USDC, WAVAX, job, jobDetail } from "@/test/apiFixtures";
import { ShieldPipeline } from "./ShieldPipeline";

const ts = "2026-11-19T10:00:01.000Z";
const usdc = (n: number) => ({ type: "amount" as const, amount: String(n * 1_000_000), token: USDC as `0x${string}`, symbol: "USDC", decimals: 6 });
const ok = (id: string, extra: Partial<CheckRow> = {}): CheckRow => ({ id, pass: true, reasonCode: null, actual: null, limit: null, ...extra });

const precheckRows = (amount: number): CheckRow[] => [
  ok("agent-signer"),
  ok("kill-switch", { actual: { type: "bool", value: true } }),
  amount > 500
    ? { id: "per-trade-cap", pass: false, reasonCode: "ExceedsPerTxCap", actual: usdc(amount), limit: usdc(500) }
    : ok("per-trade-cap", { actual: usdc(amount), limit: usdc(500) }),
  ok("daily-cap", { actual: usdc(200 + amount), limit: usdc(1_500) }),
  ok("recipient", { actual: { type: "address", value: SAFE }, limit: { type: "address", value: SAFE } }),
];

const detail = (over: Partial<JobDetailDto>): JobDetailDto => ({ ...jobDetail(job()), ...over });

describe("ShieldPipeline", () => {
  it("over-withdraw: stops at pre-check and shows the trade against the per-trade cap", () => {
    render(
      <ShieldPipeline
        job={detail({
          status: "rejected",
          reasonCode: "ExceedsPerTxCap",
          intent: { ...job().intent!, amountIn: "2000000000" },
          precheck: { ok: false, reasons: ["ExceedsPerTxCap"] },
          audit: [{ shield: "precheck", result: "fail", reason: "ExceedsPerTxCap", ts, checks: precheckRows(2_000) }],
        })}
      />,
    );
    const gate = screen.getByRole("tab", { name: /pre-check/i });
    expect(gate).toHaveAttribute("aria-selected", "true");
    expect(gate).toHaveTextContent("Stopped here");
    expect(screen.getByRole("tab", { name: /simulation/i })).toHaveTextContent("Not reached");

    const row = screen.getByText("Per-trade cap").closest("li")!;
    expect(within(row).getByText("Fail")).toBeInTheDocument();
    expect(within(row).getByText("ExceedsPerTxCap")).toBeInTheDocument();
    expect(row).toHaveTextContent("2,000 USDC");
    expect(row).toHaveTextContent("≤ 500 USDC");
    // Daily cap: spent today, this trade and the cap.
    expect(screen.getByText(/200 spent \+ 2,000 this trade \/ 1,500 USDC cap/)).toBeInTheDocument();
  });

  it("normal trade: every gate passes and the simulation shows what moved", () => {
    const sim: CheckRow[] = [ok("sim-executes"), ok("sim-token-in", { actual: { ...usdc(0), amount: "-200000000" } }), ok("sim-token-out", { actual: { type: "amount", amount: "9500000000000000000", token: WAVAX as `0x${string}`, symbol: "WAVAX", decimals: 18 } })];
    render(
      <ShieldPipeline
        job={detail({
          status: "confirmed",
          txHash: TX,
          audit: [
            { shield: "precheck", result: "pass", reason: null, ts, checks: precheckRows(200) },
            { shield: "simulation", result: "pass", reason: null, ts, checks: sim },
            { shield: "invariant", result: "pass", reason: null, ts, checks: [ok("inv-output")] },
            { shield: "onchain", result: "pass", reason: null, ts, checks: [ok("tx-sent", { actual: { type: "text", value: TX } })] },
          ],
        })}
      />,
    );
    for (const name of [/pre-check/i, /simulation/i, /invariants/i, /on-chain/i]) expect(screen.getByRole("tab", { name })).toHaveTextContent("Passed");
    fireEvent.click(screen.getByRole("tab", { name: /simulation/i }));
    expect(screen.getByText("Vault pays").closest("li")).toHaveTextContent("-200 USDC");
    expect(screen.getByText("Vault receives").closest("li")).toHaveTextContent("9.5 WAVAX");
  });

  it("bypass: Shield 1 shows as bypassed and Shield 2 stops the transaction on chain", () => {
    render(
      <ShieldPipeline
        job={detail({
          kind: "attack",
          origin: "redteam",
          status: "reverted",
          precheck: null,
          txHash: TX,
          reasonCode: "ExceedsPerTxCap",
          audit: [
            {
              shield: "onchain",
              result: "fail",
              reason: "ExceedsPerTxCap",
              ts,
              checks: [ok("tx-sent", { actual: { type: "text", value: TX } }), { id: "tx-result", pass: false, reasonCode: "ExceedsPerTxCap", actual: { type: "text", value: "ExceedsPerTxCap" }, limit: null }],
            },
          ],
        })}
      />,
    );
    expect(screen.getByRole("tab", { name: /on-chain/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /pre-check/i })).toHaveTextContent("Bypassed");
    expect(screen.getByText("Contract accepted it").closest("li")).toHaveTextContent("Fail");
    expect(screen.getByRole("link", { name: /0x/ })).toHaveAttribute("href", expect.stringContaining(TX));
    fireEvent.click(screen.getByRole("tab", { name: /pre-check/i }));
    expect(screen.getByText(/straight to the blockchain/)).toBeInTheDocument();
  });

  it("while running: the current gate is checking, later ones wait", () => {
    render(<ShieldPipeline job={detail({ status: "simulating", audit: [{ shield: "precheck", result: "pass", reason: null, ts, checks: [] }] })} />);
    expect(screen.getByRole("tab", { name: /simulation/i })).toHaveTextContent("Checking…");
    expect(screen.getByRole("tab", { name: /on-chain/i })).toHaveTextContent("Waiting");
  });

  it("an older job without a rule table falls back to its one-line reason, never made-up numbers", () => {
    render(
      <ShieldPipeline
        job={detail({ status: "rejected", reasonCode: "ExceedsDailyCap", precheck: { ok: false, reasons: ["ExceedsDailyCap"] }, audit: [{ shield: "precheck", result: "fail", reason: "ExceedsDailyCap", ts, checks: [] }] })}
      />,
    );
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/daily/i);
  });

  it("moves between gates with the arrow keys", () => {
    render(<ShieldPipeline job={detail({ status: "rejected", audit: [{ shield: "precheck", result: "fail", reason: "ZeroMinOut", ts, checks: [] }] })} />);
    const first = screen.getByRole("tab", { name: /pre-check/i });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /simulation/i })).toHaveFocus();
    expect(screen.getByRole("tab", { name: /simulation/i })).toHaveAttribute("aria-selected", "true");
  });
  it("switching gates back and forth never piles tables up (money-flow gates included)", () => {
    // Duplicate sibling keys made React keep old rows when switching tabs; React reports them on console.error.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const sim: CheckRow[] = [ok("sim-executes"), ok("sim-token-in", { actual: { ...usdc(0), amount: "-200000000" } }), ok("sim-token-out", { actual: { type: "amount", amount: "9500000000000000000", token: WAVAX as `0x${string}`, symbol: "WAVAX", decimals: 18 } })];
    render(
      <ShieldPipeline
        job={detail({
          status: "confirmed",
          txHash: TX,
          audit: [
            { shield: "precheck", result: "pass", reason: null, ts, checks: precheckRows(200) },
            { shield: "simulation", result: "pass", reason: null, ts, checks: sim },
            { shield: "invariant", result: "pass", reason: null, ts, checks: [ok("inv-output", { actual: { type: "amount", amount: "9500000000000000000", token: WAVAX as `0x${string}`, symbol: "WAVAX", decimals: 18 } })] },
            { shield: "onchain", result: "pass", reason: null, ts, checks: [ok("tx-sent", { actual: { type: "text", value: TX } })] },
          ],
        })}
      />,
    );
    const panel = () => screen.getByRole("tabpanel");
    for (const name of [/simulation/i, /pre-check/i, /simulation/i, /invariants/i, /simulation/i]) fireEvent.click(screen.getByRole("tab", { name }));
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(sim.length);
    expect(within(panel()).getAllByRole("figure")).toHaveLength(1);
    expect(errors.mock.calls.filter((c) => String(c[0]).includes("same key"))).toEqual([]);
    errors.mockRestore();
  });
});
