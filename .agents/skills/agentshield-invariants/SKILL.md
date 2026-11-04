---
name: agentshield-invariants
description: Core architectural invariants and threat model for AgentShield (Safe vault + AgentPolicyModule + off-chain auditor on Avalanche Fuji). Use whenever writing, editing, or reviewing any code in this repo - contracts, NestJS server, workers, web dashboard, scripts - or when a change touches keys, signing, money amounts, policy/spend state, LLM output, kill-switch, or trust boundaries. Prevents violations of principles P1-P5 and the Shield 1 / Shield 2 split.
metadata:
  owner: all
  source: docs/architecture/system-design.md
---

# AgentShield invariants

Two shields: **Shield 1** (off-chain: precheck, Anvil sim, invariants) is helpful but bypassable. **Shield 2** (`AgentPolicyModule` on-chain) is the only trusted enforcement. Never move a security rule from Shield 2 into Shield 1.

## Hard rules (stop and ask if a task seems to require breaking one)
1. **P1 Chain is truth.** Policy, `spentInDay`, `isActive` are read from the contract. Postgres holds read-models and audit logs only. Never store `spentToday` in the DB.
2. **P2 Owner acts directly.** `setPolicy` and Kill-Switch are signed by the owner wallet in the browser (wagmi). No `POST /kill`, no `POST /policy`, no backend path that holds or proxies the owner key.
3. **P3 LLM has no authority.** Verdict, `budgetUsedPct`, amounts, recipients, and the decision to sign are computed deterministically. The LLM writes only `messageVi` and runs in parallel with broadcast, off the critical path.
4. **P4 Single writer.** One session key = one nonce chain. `swap` and `attack` queues run `concurrency: 1` and share one `TxSender` (mutex + nonceManager).
5. **P5 Money is bigint.** Base units everywhere; JSON as string; DB `NUMERIC(78,0)`; format only in the UI. USDC 6 decimals, WAVAX 18. No `number`/float for amounts.
6. **Key hygiene.** Only `modules/execution` imports the agent key (`AGENT_PRIVATE_KEY`, session key only). The owner key never appears in code, env, fixtures, or logs. Never log secrets.
7. **Revert is a correct result.** Never retry a Shield 2 revert; retry only infra errors (RPC timeout/5xx) with backoff.
8. **Boundaries.** `domain/` is pure TypeScript (no `@nestjs/*`, `viem`, `drizzle`). `core/` never imports `modules/`. Modules use each other only via exported providers or events. Each table has one owning module.

## Quick checklist before finishing any change
- Does anything new decide money/addresses/signing from LLM output? -> reject.
- Does any new endpoint or worker hold a key that can change policy? -> reject.
- Any `parseFloat`, `Number(amount)`, `toFixed` on token amounts? -> replace with bigint helpers from `packages/shared/src/money.ts`.
- Did a contract signature/event change? -> regenerate ABIs (skill `shared-contract-sync`).
- New attack surface? Map it to a threat in [references/threat-matrix.md](references/threat-matrix.md) and say which shield stops it.

## References
- Threat -> defense matrix T1-T7: [references/threat-matrix.md](references/threat-matrix.md)
- Glossary (EN/VN) and demo numbers: [references/glossary.md](references/glossary.md)
- Full design: `docs/architecture/system-design.md`, `docs/architecture/codebase.md`
