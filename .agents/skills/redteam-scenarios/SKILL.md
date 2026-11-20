---
name: redteam-scenarios
description: Implement and extend the Red-Team Chaos worker - the 4 attack buttons (over-withdraw, wrong recipient, unlimited approval, bypass website) plus the Hijacked Agent (prompt injection planned by an LLM brain) and Auto red-team. Use when working on redteam scenarios, attack queue, POST /attacks/*, forcing an on-chain revert with manual gas, GS104 Safe error, or producing Snowtrace evidence for the demo.
paths: "apps/server/src/modules/redteam/**"
metadata:
  owner: AIE
  source: docs/architecture/system-design.md section 5
---

# Red-team scenarios

Every button must cause a **real** action and a real block, not a UI animation. Judges will ask.

| # | Scenario file | Real action | Stopped by | Evidence |
|---|---|---|---|---|
| 1 | `over-withdraw` | enqueue `SwapIntent` 2,000 USDC through the normal `swap` queue (Auditor) | precheck `ExceedsPerTxCap` + sim revert | red card + VN explanation |
| 2 | `wrong-recipient` | intent with `recipient=0x999...`; variant: agent EOA calls router directly | precheck; on-chain there is no recipient param | red card "recipient locked = Safe" |
| 3 | `unlimited-approval` | session key calls `safe.execTransactionFromModule(USDC.approve(router, MAX_UINT256))` directly | Safe reverts `GS104` (agent is not an enabled module) | tx on Snowtrace |
| 4 | `bypass` | RedTeam worker signs `executeGuardedSwap(2000e6)` with the session key straight to Fuji, **skipping Auditor** | **Shield 2** `ExceedsPerTxCap` | Snowtrace link of reverted tx |
| + | `prompt-injection` (Hijacked Agent) | the visitor's text lands in the agent's market feed; the brain (`modules/agent-brain`, LLM or keyword rules) writes a plan: swap / approve / direct / none; code sizes it (bigint) | swap: Shield 1 as a `dryRun` job (`rejected`, or `held` if inside the policy). approve/direct: `eth_call` first, sent only if the chain refuses it (Safe `GS104` / Shield 2). none: `held` | `JobDto.agentPlan` card + the pipeline; Snowtrace for on-chain reverts |
| + | Auto red-team | `POST /vaults/{safe}/attacks/auto`: an attacker LLM writes 5 feed items (fallback: `AUTO_REDTEAM_FALLBACK`), each one a Hijacked Agent run | same as above | scoreboard "0 / 5 got funds out" |

## Critical technical detail (#3 and #4)
Pass `gas: 300_000n` explicitly. If viem runs `estimateGas`, the revert is caught client-side and **never mined**, so no Snowtrace evidence exists. The agent EOA needs a little AVAX for gas. Decode the revert from the receipt/`call` replay with `decodeErrorResult` and publish `job.updated {status:"reverted", txHash, revertError}`.

## Structure
`scenario.interface.ts` -> `plan(ctx): AttackPlan` (pure, no I/O); one file per fixed scenario, registered in `scenarios/index.ts` as `Record<FixedAttackScenario, …>` so a missing one fails to compile. Prompt injection is not a fixed scenario: the controller queues it on the attack queue and `HijackService` plans it in the worker. Plans are `shield1` (a `SwapIntent` sent through the normal `swap` queue) or `onchain` (built by `onchain-calls.ts` with manual gas). Controller: `POST /vaults/{safe}/attacks` with body `CreateAttackRequest` from `packages/shared` (`{scenario}` or `{scenario:"prompt-injection", text}`), api.md #12; it routes Shield 1 plans to the swap queue and on-chain plans to `@Processor('attack')` (`concurrency: 1`, shares the single `TxSender`, see `tx-execution`). Expected outcomes per fixed scenario live in shared `ATTACK_EXPECTATIONS`. Every Shield 1 attack is queued with `dryRun: true`: a red-team job is judged, never signed. Never broadcast something the chain would accept: on-chain hijack plans go through `TxSender.callRaw` (eth_call) first.

## Adding a scenario
Add id to the shared enum, implement the interface, state which shield must stop it and what evidence shows, add an integration test asserting the block (and, for on-chain ones, that the Safe balance is unchanged). Attacks never use the owner key.
