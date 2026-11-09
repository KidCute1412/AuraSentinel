import { useEffect } from "react";
import { create } from "zustand";
import type { Address, JobDetailDto, JobStatus, StateDto } from "@agentshield/shared";
import { toAmount, fromAmount } from "@agentshield/shared";
import type { VaultView } from "./vaultSource";
import {
  applyConfirmedSwap,
  ATTACKER,
  explainTerminalJob,
  fakeHash,
  finalizeJob,
  planJob,
  pctOf,
  TOKENS,
  USDC,
  WAVAX,
  withBudget,
  type JobSpec,
  type TokenSymbol,
  type VaultSim,
} from "./mockEngine";

/**
 * In-memory stand-in for the backend + chain: holds each vault's state and jobs and plays the pipeline with
 * timers so the UI shows real intermediate states. Replace this module (and vaultSource) with API calls later;
 * components only talk to the hooks and action factories exported here.
 */

export interface SentTx {
  hash: string;
  wait: () => Promise<void>;
}

/** Timings in ms. Tests set them to 0. */
export const delays = { step: 450, explain: 650, sign: 650, mine: 1300 };
export const setMockDelays = (d: Partial<typeof delays>) => Object.assign(delays, d);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const key = (safe: string) => safe.toLowerCase();
const uuid = (): string => crypto.randomUUID();

const DAY = 86_400;
const policyFor = (agent: Address, nowSec: number) => ({
  agentSigner: agent,
  expiry: nowSec + 30 * DAY,
  limits: [
    { token: USDC, maxPerTx: toAmount(500_000_000n), dailyCap: toAmount(1_500_000_000n) },
    { token: WAVAX, maxPerTx: toAmount(20n * 10n ** 18n), dailyCap: toAmount(60n * 10n ** 18n) },
  ],
});

function baseState(view: VaultView, nowSec: number): StateDto {
  return {
    safe: view.safe,
    blockNumber: "49234500",
    isActive: true,
    policyEpoch: 1,
    policy: policyFor(view.agent, nowSec),
    spentToday: [{ token: USDC, dayId: Math.floor(nowSec / DAY), amount: "0" }],
    balances: [
      { token: USDC, symbol: "USDC", decimals: 6, amount: toAmount(3_000_000_000n) },
      { token: WAVAX, symbol: "WAVAX", decimals: 18, amount: toAmount(10n * 10n ** 18n) },
    ],
    budgetUsedPct: 0,
    stale: !!view.stale,
  };
}

/** Seed a believable history by replaying real engine decisions, so every number is consistent. */
export function seedSim(view: VaultView, nowMs = Date.now()): VaultSim | null {
  if (view.scenario === "none") return null;
  const nowSec = Math.floor(nowMs / 1000);
  let state = baseState(view, nowSec);
  const jobs: JobDetailDto[] = [];
  let lastChange: VaultSim["lastChange"] = null;
  let n = 0;
  const add = (spec: JobSpec, minutesAgo: number, source: "llm" | "template") => {
    const plan = planJob(spec, state, view.safe, nowSec);
    const iso = new Date(nowMs - minutesAgo * 60_000).toISOString();
    const id = `00000000-0000-4000-8000-${view.safe.slice(-6).padStart(6, "0")}${(++n).toString().padStart(6, "0")}`;
    const job = finalizeJob({ id, safe: view.safe, plan, state, nowIso: iso, createdAt: iso, withExplanation: true, source });
    if (plan.terminal === "confirmed") {
      const before = state.balances;
      state = applyConfirmedSwap(state, plan.amountIn);
      lastChange = { jobId: id, before, after: state.balances };
      job.explanation = { ...job.explanation!, budgetUsedPct: state.budgetUsedPct };
    }
    jobs.unshift(job);
  };
  const swap = (usdc: bigint, minutesAgo: number, source: "llm" | "template" = "template") => add({ type: "rebalance", amountIn: usdc }, minutesAgo, source);

  if (view.scenario === "demo") {
    swap(500_000_000n, 95);
    swap(500_000_000n, 60);
    swap(312_500_000n, 22, "llm");
  } else if (view.scenario === "exhausted") {
    swap(500_000_000n, 120);
    swap(500_000_000n, 80);
    swap(500_000_000n, 40);
  } else {
    swap(200_000_000n, 55, "llm");
    add({ type: "attack", scenario: "over-withdraw" }, 31, "template");
    add({ type: "attack", scenario: "bypass" }, 12, "template");
  }

  const killed = view.scenario === "killed";
  return {
    state: withBudget(killed ? { ...state, isActive: false } : state),
    jobs,
    lastChange,
    killLatenciesMs: killed ? [1480] : [],
    epoch: 1,
  };
}

interface MockChain {
  sims: Record<string, VaultSim>;
  ensure: (view: VaultView) => void;
  patch: (safe: string, fn: (sim: VaultSim) => VaultSim) => void;
  reset: () => void;
}

export const useMockChain = create<MockChain>((set, get) => ({
  sims: {},
  ensure: (view) => {
    if (get().sims[key(view.safe)]) return;
    const sim = seedSim(view);
    if (sim) set((s) => ({ sims: { ...s.sims, [key(view.safe)]: sim } }));
  },
  patch: (safe, fn) =>
    set((s) => {
      const cur = s.sims[key(safe)];
      return cur ? { sims: { ...s.sims, [key(safe)]: fn(cur) } } : s;
    }),
  reset: () => set({ sims: {} }),
}));

/** Live simulated state of a vault; `undefined` until seeded (and for vaults that are not set up yet). */
export function useVaultSim(view: VaultView): VaultSim | undefined {
  const ensure = useMockChain((s) => s.ensure);
  useEffect(() => ensure(view), [ensure, view]);
  return useMockChain((s) => s.sims[key(view.safe)]);
}

const nowSec = () => Math.floor(Date.now() / 1000);
const patchJob = (safe: string, id: string, fn: (j: JobDetailDto) => JobDetailDto) =>
  useMockChain.getState().patch(safe, (sim) => ({ ...sim, jobs: sim.jobs.map((j) => (j.id === id ? fn(j) : j)) }));

/** Which audit entries are already known while a job is in a given status. */
function auditUpTo(status: JobStatus, iso: string): JobDetailDto["audit"] {
  const pass = (shield: JobDetailDto["audit"][number]["shield"]) => ({ shield, result: "pass" as const, reason: null, ts: iso });
  if (status === "simulating") return [pass("precheck")];
  if (status === "broadcasting") return [pass("precheck"), pass("simulation"), pass("invariant")];
  return [];
}

/**
 * Start a job and return its id immediately; the pipeline keeps playing in the background
 * (queued -> checking -> simulating -> broadcasting -> verdict, then the explanation a moment later).
 */
export function startJob(view: VaultView, spec: JobSpec): string {
  const store = useMockChain.getState();
  store.ensure(view);
  const sim = store.sims[key(view.safe)];
  if (!sim) throw new Error("Vault is not set up yet");
  const id = uuid();
  const created = new Date().toISOString();
  const plan = planJob(spec, sim.state, view.safe, nowSec());
  const shell = finalizeJob({ id, safe: view.safe, plan, state: sim.state, nowIso: created, createdAt: created, withExplanation: false });
  const pending: JobDetailDto = { ...shell, status: plan.progress[0], txHash: null, explorerUrl: null, revertError: null, reasonCode: null, sim: null, precheck: null, audit: [] };
  store.patch(view.safe, (s) => ({ ...s, jobs: [pending, ...s.jobs] }));

  void (async () => {
    for (const status of plan.progress.slice(1)) {
      await sleep(delays.step);
      patchJob(view.safe, id, (j) => ({ ...j, status, audit: auditUpTo(status, new Date().toISOString()), updatedAt: new Date().toISOString() }));
    }
    await sleep(delays.step);
    // Judge again against the state as it is NOW: a job that raced another one must not overspend.
    const current = useMockChain.getState().sims[key(view.safe)];
    if (!current) return;
    const finalPlan = planJob(spec, current.state, view.safe, nowSec());
    const iso = new Date().toISOString();
    const done = finalizeJob({ id, safe: view.safe, plan: finalPlan, state: current.state, nowIso: iso, createdAt: created, withExplanation: false });
    let afterState = current.state;
    store.patch(view.safe, (s) => {
      let lastChange = s.lastChange;
      if (finalPlan.terminal === "confirmed") {
        afterState = applyConfirmedSwap(s.state, finalPlan.amountIn);
        lastChange = { jobId: id, before: s.state.balances, after: afterState.balances };
      } else afterState = s.state;
      return { ...s, state: afterState, lastChange, jobs: s.jobs.map((j) => (j.id === id ? done : j)) };
    });
    await sleep(delays.explain);
    patchJob(view.safe, id, (j) => explainTerminalJob(j, afterState, finalPlan));
  })();

  return id;
}

/** A wallet-signed action: sign (wallet popup), then wait to be mined. `onMined` applies the effect. */
function mockTx(onMined: () => void, mineMs = delays.mine) {
  return async (): Promise<SentTx> => {
    await sleep(delays.sign);
    return {
      hash: fakeHash(uuid()),
      wait: async () => {
        await sleep(mineMs);
        onMined();
      },
    };
  };
}

/** Owner revokes the policy. Browser-signed on the real chain (invariant 2). */
export const killTx = (safe: string) =>
  mockTx(() =>
    useMockChain.getState().patch(safe, (s) => ({ ...s, state: { ...s.state, isActive: false, blockNumber: (BigInt(s.state.blockNumber) + 1n).toString() } })),
  );

export interface PolicyInput {
  usdcMaxPerTx: bigint;
  usdcDailyCap: bigint;
  wavaxMaxPerTx: bigint;
  wavaxDailyCap: bigint;
  expiry: number;
}

/** Owner sets a new policy; a locked vault becomes active again under a new epoch. */
export const setPolicyTx = (safe: string, input: PolicyInput) =>
  mockTx(() =>
    useMockChain.getState().patch(safe, (s) => ({
      ...s,
      epoch: s.epoch + 1,
      state: withBudget({
        ...s.state,
        isActive: true,
        policyEpoch: s.state.policyEpoch + 1,
        blockNumber: (BigInt(s.state.blockNumber) + 1n).toString(),
        policy: {
          ...s.state.policy,
          expiry: input.expiry,
          limits: [
            { token: USDC, maxPerTx: toAmount(input.usdcMaxPerTx), dailyCap: toAmount(input.usdcDailyCap) },
            { token: WAVAX, maxPerTx: toAmount(input.wavaxMaxPerTx), dailyCap: toAmount(input.wavaxDailyCap) },
          ],
        },
      }),
    })),
  );

export const moveFundsTx = (safe: string, direction: "deposit" | "withdraw", symbol: TokenSymbol, amount: bigint) =>
  mockTx(() =>
    useMockChain.getState().patch(safe, (s) => ({
      ...s,
      state: {
        ...s.state,
        blockNumber: (BigInt(s.state.blockNumber) + 1n).toString(),
        balances: s.state.balances.map((b) => {
          if (b.symbol !== symbol) return b;
          const cur = fromAmount(b.amount);
          const next = direction === "deposit" ? cur + amount : cur - amount;
          if (next < 0n) throw new Error("InsufficientBalance");
          return { ...b, amount: toAmount(next) };
        }),
      },
    })),
  );

/** What the connected wallet can deposit (mock). */
export const WALLET_BALANCES: Record<TokenSymbol, bigint> = { USDC: 10_000_000_000n, WAVAX: 50n * 10n ** 18n };

export const tokenInfo = TOKENS;
export { ATTACKER, pctOf };
