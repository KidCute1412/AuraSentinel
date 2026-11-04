---
name: policy-module-contract
description: Write, modify, test, and deploy AgentPolicyModule.sol (Safe module enforcing the 5 gates) with Foundry. Use when working in packages/contracts - executeGuardedSwap, custom errors, events, per-token caps, Kill-Switch, Safe execTransactionFromModule, MockUSDC/Trader Joe pool setup, forge unit/fuzz/invariant/fork tests, deploy scripts, or fixing contract weaknesses C1-C9.
paths: "packages/contracts/**"
metadata:
  owner: FS1
  source: docs/architecture/system-design.md section 6
---

# AgentPolicyModule (Shield 2)

Read [agentshield-invariants](../agentshield-invariants/SKILL.md) first. This contract is the only unbypassable defense; keep it small (~180 lines) and boring.

## Required design (fixes C1-C9)
- **Per-token limits:** `mapping(address token => Limits{maxPerTx, dailyCap})`, `spentInDay[token][dayId]`. Never one cap across tokens (a 500 cap on WAVAX = 500 WAVAX).
- **No caller-supplied path/recipient.** Build `path = [tokenIn, tokenOut]` inside; require `tokenIn != tokenOut`; recipient is `address(safe)`.
- **Safe calls:** `safe.execTransactionFromModule(to, 0, data, Enum.Operation.Call)`. Never `DelegateCall`. Check the returned bool.
- **Exact approval:** `approve(router, amountIn)` then swap; afterwards assert `allowance(safe, router) == 0` (else `approve(0)`).
- **Result check:** measure `balanceOf(safe, tokenOut)` before/after, require `delta >= minOut`; require `minOut > 0`. Do not trust router return values.
- **deadline** `<= block.timestamp + 10 minutes`.
- **Owner:** EOA owner; `setPolicy`, `revoke` (Kill-Switch, sets `isActive=false`), `setLimits`, `setAllowedToken` are `onlyOwner`. Second kill layer: owner `safe.disableModule`.
- **Events:** `PolicySet`, `PolicyRevoked`, `GuardedSwap(tokenIn, tokenOut, amountIn, amountOut, dayId, spentToday)`.
- **Custom errors only** (no revert strings): `UnauthorizedAgent`, `PolicyInactive`, `TokenNotWhitelisted`, `ExceedsPerTxCap`, `ExceedsDailyCap`, `InvalidDeadline`, `SlippageTooHigh`, ... Each must have a Vietnamese mapping in `packages/shared/src/errors.ts` (see `shared-contract-sync`).
- Check-effects-interactions: update `spentInDay` before external calls; consider `nonReentrant`.

## Test requirements (all must exist before Fuji deploy)
1. **Unit:** one test per gate and per custom error; kill-switch makes every call revert; day rollover resets counter (`vm.warp`).
2. **Fuzz:** `testFuzz_attackerNeverProfits(amount, caller)` with `[profile.default.fuzz] runs = 10000`.
3. **Invariant with handler** (`test/handlers/`): random `executeGuardedSwap`, `warp` across days, `revoke`, calls from attacker. Invariants: `spentInDay <= dailyCap`; attacker balance == 0; after revoke `spentInDay` never increases.
4. **Fork test** against Fuji: real Trader Joe swap with exact approval on the seeded pool.
Run: `forge test -vvv`, `forge test --match-test invariant`, `forge coverage`. Keep screenshot of 10,000 passing runs (demo asset).

## Deploy flow
`script/Deploy.s.sol` (MockUSDC + module) -> `SetupPool.s.sol` (addLiquidity on TJ factory) -> owner `enableModule` + `SetPolicy.s.sol`. Read keys/RPC from env via `vm.envUint`; never commit keys. After any ABI change run `pnpm --filter shared gen`.

## Anti-patterns
Storing agent-supplied `recipient`/`path`; one global cap; `tx.origin`; unbounded loops; trusting `minOut` from agent without `> 0`; changing a custom error name without updating shared errors map.
