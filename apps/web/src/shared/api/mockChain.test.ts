import { beforeEach, describe, expect, it } from "vitest";
import { FIXTURES, FIXTURE_SAFES } from "./vaultSource";
import { killTx, moveFundsTx, setMockDelays, setPolicyTx, startJob, useMockChain } from "./mockChain";
import { balanceOf, spentUsdc } from "./mockEngine";

const view = (k: keyof typeof FIXTURE_SAFES) => FIXTURES[FIXTURE_SAFES[k].toLowerCase()];
const sim = (k: keyof typeof FIXTURE_SAFES) => useMockChain.getState().sims[FIXTURE_SAFES[k].toLowerCase()];
const settle = async (k: keyof typeof FIXTURE_SAFES, id: string) => {
  for (let i = 0; i < 200; i++) {
    const j = sim(k).jobs.find((x) => x.id === id);
    if (j && j.explanation) return j;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error("job never settled");
};

beforeEach(() => {
  setMockDelays({ step: 0, explain: 0, sign: 0, mine: 0 });
  useMockChain.getState().reset();
});

describe("startJob", () => {
  it("plays a safe rebalance to confirmation and moves the money", async () => {
    useMockChain.getState().ensure(view("healthy"));
    const before = sim("healthy").state;
    const id = startJob(view("healthy"), { type: "rebalance", amountIn: 100_000_000n });
    expect(sim("healthy").jobs[0].id).toBe(id);
    expect(sim("healthy").jobs[0].status).toBe("queued");
    const job = await settle("healthy", id);
    expect(job.status).toBe("confirmed");
    expect(job.explanation?.verdict).toBe("safe");
    const after = sim("healthy").state;
    expect(balanceOf(after, "USDC")).toBe(balanceOf(before, "USDC") - 100_000_000n);
    expect(spentUsdc(after)).toBe(spentUsdc(before) + 100_000_000n);
    expect(sim("healthy").lastChange?.jobId).toBe(id);
  });

  it("an attack never changes balances or spend", async () => {
    useMockChain.getState().ensure(view("healthy"));
    const before = sim("healthy").state;
    for (const scenario of ["over-withdraw", "wrong-recipient", "unlimited-approval", "bypass"] as const) {
      const id = startJob(view("healthy"), { type: "attack", scenario });
      const job = await settle("healthy", id);
      expect(["rejected", "reverted"]).toContain(job.status);
      expect(job.explanation?.verdict).toBe("blocked");
    }
    expect(sim("healthy").state.balances).toEqual(before.balances);
    expect(sim("healthy").state.spentToday).toEqual(before.spentToday);
  });

  it("two jobs racing for the last of the budget cannot overspend", async () => {
    useMockChain.getState().ensure(view("healthy"));
    // healthy has 200 of 1,500 spent. Queue three 500s: only two fit (200+500+500=1,200, third would be 1,700).
    const ids = [1, 2, 3].map(() => startJob(view("healthy"), { type: "rebalance", amountIn: 500_000_000n }));
    const jobs = await Promise.all(ids.map((id) => settle("healthy", id)));
    expect(jobs.filter((j) => j.status === "confirmed")).toHaveLength(2);
    expect(jobs.filter((j) => j.reasonCode === "ExceedsDailyCap")).toHaveLength(1);
    expect(spentUsdc(sim("healthy").state)).toBe(1_200_000_000n);
  });

  it("refuses to start on a vault that is not set up", () => {
    expect(() => startJob(view("stoppedAtModule"), { type: "rebalance", amountIn: 1n })).toThrow(/not set up/);
  });
});

describe("wallet-signed actions", () => {
  it("kill locks the vault and every later action is answered with PolicyInactive", async () => {
    useMockChain.getState().ensure(view("healthy"));
    const sent = await killTx(FIXTURE_SAFES.healthy)();
    expect(sim("healthy").state.isActive).toBe(true); // not yet mined
    await sent.wait();
    expect(sim("healthy").state.isActive).toBe(false);
    const job = await settle("healthy", startJob(view("healthy"), { type: "rebalance", amountIn: 1_000_000n }));
    expect(job.reasonCode).toBe("PolicyInactive");
  });

  it("a new policy re-activates a locked vault under a new epoch", async () => {
    useMockChain.getState().ensure(view("killed"));
    const epoch = sim("killed").state.policyEpoch;
    const input = { usdcMaxPerTx: 100_000_000n, usdcDailyCap: 300_000_000n, wavaxMaxPerTx: 1n * 10n ** 18n, wavaxDailyCap: 3n * 10n ** 18n, expiry: Math.floor(Date.now() / 1000) + 86_400 };
    await (await setPolicyTx(FIXTURE_SAFES.killed, input)()).wait();
    const s = sim("killed").state;
    expect(s.isActive).toBe(true);
    expect(s.policyEpoch).toBe(epoch + 1);
    expect(s.policy.limits[0].maxPerTx).toBe("100000000");
  });

  it("deposit and withdraw move exactly the amount, and cannot withdraw more than held", async () => {
    useMockChain.getState().ensure(view("healthy"));
    const start = balanceOf(sim("healthy").state, "USDC");
    await (await moveFundsTx(FIXTURE_SAFES.healthy, "deposit", "USDC", 50_000_000n)()).wait();
    expect(balanceOf(sim("healthy").state, "USDC")).toBe(start + 50_000_000n);
    await (await moveFundsTx(FIXTURE_SAFES.healthy, "withdraw", "USDC", 20_000_000n)()).wait();
    expect(balanceOf(sim("healthy").state, "USDC")).toBe(start + 30_000_000n);
    await expect((await moveFundsTx(FIXTURE_SAFES.healthy, "withdraw", "USDC", start * 10n)()).wait()).rejects.toThrow("InsufficientBalance");
  });
});
