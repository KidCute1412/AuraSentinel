---
name: redteam-scenarios
description: Implement and extend the Red-Team Chaos worker - the 4 attack buttons (over-withdraw, wrong recipient, unlimited approval, bypass website) plus the prompt-injection box. Use when working on redteam scenarios, attack queue, POST /attacks/*, forcing an on-chain revert with manual gas, GS104 Safe error, or producing Snowtrace evidence for the demo.
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
| + | `prompt-injection` | text -> explainer as `<untrusted_input>` | LLM has no authority; numeric guard | badge "template" if output bad |

## Critical technical detail (#3 and #4)
Pass `gas: 300_000n` explicitly. If viem runs `estimateGas`, the revert is caught client-side and **never mined**, so no Snowtrace evidence exists. The agent EOA needs a little AVAX for gas. Decode the revert from the receipt/`call` replay with `decodeErrorResult` and publish `job.updated {status:"reverted", txHash, revertError}`.

## Structure
`scenario.interface.ts` -> `run(ctx): Promise<ScenarioResult>`; one file per scenario; `redteam.processor.ts` (`@Processor('attack')`, `concurrency: 1`, shares the single `TxSender`, see `tx-execution`). Controller: `POST /attacks/:scenario` (`over-withdraw|wrong-recipient|unlimited-approval|bypass`) and `POST /attacks/inject {text}`.

## Adding a scenario
Add id to the shared enum, implement the interface, state which shield must stop it and what evidence shows, add an integration test asserting the block (and, for on-chain ones, that the Safe balance is unchanged). Attacks never use the owner key.
