---
name: design-review
description: Review the current diff or given paths against AgentShield's design invariants - principles P1-P5, module boundary rules, threat checklist T1-T7, and key hygiene. Invoke manually before merging; complements the built-in code-review and security-review.
disable-model-invocation: true
context: fork
agent: Explore
argument-hint: "[path-or-branch]"
allowed-tools: Read Grep Glob Bash(git diff *) Bash(git log *) Bash(git status *)
metadata:
  source: docs/architecture/system-design.md section 10
---

# Design conformance review: $ARGUMENTS

Review (read-only) the diff vs `main` (or the given target). Read `.agents/skills/agentshield-invariants/SKILL.md` and its `references/threat-matrix.md` first.

## Check each
1. **P1** DB mirrors of policy/spent/`isActive` or logic trusting DB over chain.
2. **P2** any backend route/worker/env that can call `setPolicy`/revoke or holds an owner key (`POST /kill`, `OWNER_*`).
3. **P3** LLM output used for amount, address, verdict, `budgetUsedPct`, or to gate signing.
4. **P4** second signer path, `concurrency > 1` on `swap`/`attack`, nonce handling outside `TxSender`.
5. **P5** `number`/`parseFloat`/`toFixed`/`Number()` on token amounts; bigint serialized as number.
6. **Keys/secrets** in code, fixtures, logs; agent key imported outside `modules/execution`.
7. **Boundaries** `domain/` importing `@nestjs/*|viem|drizzle`; `core/` importing `modules/`; cross-module internals; foreign table queries; features importing features (web).
8. **Contract** (if touched) per-token caps, no caller path/recipient, `Call` not `DelegateCall`, exact approval + allowance 0, custom errors mapped in shared, tests present (unit/fuzz/invariant).
9. **Retries** revert retried; infra errors not retried.
10. **Threats** new surface not mapped to T1-T7.

## Output
Table of findings: severity (blocker/major/minor), rule violated, `file:line`, concrete fix. End with "No violations" per rule that passed. Do not edit files.
