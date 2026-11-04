---
name: tx-execution
description: Implement the single transaction-sending path with the agent session key using viem - TxSender port, mutex plus nonceManager, fallback RPC transports, manual gas options, revert decoding to reason codes, env/key handling. Use when working on modules/execution, core/chain (public client, agent wallet, contracts), nonce errors, RPC failover, or anything that signs or broadcasts a transaction from the backend.
paths: "apps/server/src/modules/execution/**, apps/server/src/core/chain/**"
metadata:
  owner: FS2
  source: docs/architecture/system-design.md P4 and section 8.2
---

# Execution (the only module that touches the session key)

Read [agentshield-invariants](../agentshield-invariants/SKILL.md) rules 4 and 6.

- `TxSenderPort` + `ViemTxSender` (real) + `FakeTxSender` (tests). Auditor and RedTeam both inject the port; nothing else imports the agent account.
- **One signer, one nonce chain:** `privateKeyToAccount(AGENT_PRIVATE_KEY, { nonceManager })` from viem plus an in-process mutex around send. Queues `swap` and `attack` both run `concurrency: 1`.
- **Never the owner key.** `AGENT_PRIVATE_KEY` is validated by the Zod env schema at boot (crash early). Log tx hashes, never keys or raw env.
- **Transport:** `fallback([primaryRpc, publicRpc], { rank: true })` for the public client; Fuji finality is ~1.5 s so wait for 1 confirmation, no reorg logic.
- **Gas:** default path may estimate; the red-team bypass passes explicit `gas` so the revert is mined (see `redteam-scenarios`).
- **Revert handling:** `revert-decoder.ts` uses `decodeErrorResult` with ABIs from `@agentshield/shared` and maps to reason codes in `shared/errors`. Reverts are final: report `reverted`, do not retry. Retry only RPC timeouts/5xx/nonce-too-low (reset nonce manager) with backoff, max 3.
- Return `{ txHash, status, revertError?, blockNumber }`; the caller (jobs service) persists and publishes events.
- Tests: `FakeTxSender` for state-machine tests; one integration test against Anvil proving a capped call reverts with `ExceedsPerTxCap`.
