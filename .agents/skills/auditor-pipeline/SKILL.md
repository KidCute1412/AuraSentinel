---
name: auditor-pipeline
description: Implement Shield 1 - the deterministic off-chain AI Auditor pipeline - plus the Anvil simulator and the quant Rebalancer. Use when working on precheck, post-sim invariants, verdict/budgetUsedPct, the job state machine, Anvil fork simulation (anvil_reset, impersonation), the swap BullMQ queue, retry/idempotency rules, or rebalance math (clamp, thresholds, getAmountsOut pricing).
paths: "apps/server/src/modules/auditor/**, apps/server/src/modules/simulation/**, apps/server/src/modules/rebalancer/**, apps/server/src/modules/jobs/**"
metadata:
  owner: AIE + FS2
  source: docs/architecture/system-design.md section 4
---

# Shield 1 pipeline

Read [agentshield-invariants](../agentshield-invariants/SKILL.md) first. Everything that decides is deterministic; the explainer runs in parallel and never gates signing.

```
SwapIntent -> (a) precheck -> (b) Anvil sim -> (c) post-sim invariants -> verdict=safe -> broadcast || explain
                  |fail           |revert            |fail
                  v               v                  v
               rejected (reason code) -> explain the rejection
```

## (a) Precheck - `auditor/domain/precheck.ts` (pure TS)
Mirror the 5 on-chain gates using current policy read from chain (`PolicyService`): agent/active/expiry, token whitelist, per-token `maxPerTx`, `spentToday + amountIn <= dailyCap`. Plus **intent-level** checks the ABI cannot express: `recipient == Safe`, `approval == amountIn`, `minOut > 0`. Return a reason code from `packages/shared/src/errors.ts`.

## (b) Simulation - `SimulatorPort` -> `AnvilSimulator`
Per job: `anvil_reset` to latest block (fork goes stale otherwise; queue concurrency 1 avoids races) -> `impersonateAccount(agent)` -> send the real `executeGuardedSwap` calldata -> read balances/allowance. Fallback if reset >500 ms: `evm_snapshot`/`evm_revert` and reset when the Indexer sees a new `GuardedSwap`. Unit-test the auditor against `FakeSimulator`.

## (c) Invariants - `domain/invariants.ts`
`ΔSafe(tokenOut) > 0`, `ΔSafe(tokenIn) == -amountIn`, `Δattacker == 0`, `allowance(router) == 0`. A sim that does not revert is not automatically safe.

## Verdict - `domain/verdict.ts`
`verdict` and `budgetUsedPct = (spentToday + amountIn) / dailyCap` computed with bigint math (integer basis points, format to 13.3% in UI). Never from the LLM.

## State machine (`jobs.status`, each transition persists + publishes `job.updated`)
`queued -> prechecking -> (rejected | simulating) -> (rejected | broadcasting) -> (confirmed | reverted | failed)`. `explanation` attaches later via `job.explained`. Insert `audit_log` rows per shield stage.

## Operational rules
- Queue `swap`: `concurrency: 1`, `attempts: 3` with exponential backoff **only for infra errors**; never retry a revert.
- Rebalancer (`rebalancer/domain/rebalance.math.ts`, no LLM): `amountIn = min(deviation, maxPerTx, dailyCap - spentToday)`; skip if deviation < ~2% of NAV; price with `router.getAmountsOut`; `jobId = rebalance:{safe}:{floor(block/10)}` and skip if a `swap` job is active/waiting; scheduler 15 s via `upsertJobScheduler`, pausable (demo mode).
- Add a `*.spec.ts` for every domain function; domain tests run in <1 s without Nest.
