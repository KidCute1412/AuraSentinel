---
name: shared-contract-sync
description: Maintain packages/shared, the contract between contracts, server, and web - Zod schemas (SwapIntent, SimResult, Explanation, JobDto, PolicyDto, ServerEvent), error-code to Vietnamese message map, bigint money helpers, chain config, and ABIs generated from Foundry via @wagmi/cli. Use when adding or changing an API payload, SSE event, custom contract error, token decimals, or when the Solidity ABI changes and types go stale.
paths: "packages/shared/**"
metadata:
  owner: FS1 + AIE
  source: docs/architecture/codebase.md section 3
---

# packages/shared

One source of truth for types. Server, web, and tests import from `@agentshield/shared`; nothing is duplicated.

## Layout
`src/schemas/*` (Zod) · `src/events.ts` (`ServerEvent` discriminated union) · `src/errors.ts` · `src/chain.ts` · `src/money.ts` · `src/generated/abis.ts` (generated, never hand-edit).

## Rules
- **Money:** amounts are `string` in JSON (bigint base units), parsed with `money.ts` helpers. Never `z.number()` for token amounts. USDC 6, WAVAX 18.
- **Schema change = contract change.** Add the field in `shared` first, then producers/consumers; Zod parses on both ends (event bus publish + SSE client).
- **Explanation:** `verdict` and `budgetUsedPct` are deterministic fields; `messageVi` max 280 chars; `source: "llm" | "template"`.
- **Errors map:** every Solidity custom error and every precheck reason code -> `{ code, messageVi }`. A missing mapping must fail a unit test, not fall through silently.
- **Addresses** come from env-validated config (`chain.ts`), `avalancheFuji` from viem.

## ABI regeneration
1. `cd packages/contracts && forge build`
2. `pnpm --filter shared gen` (wagmi cli, `foundry` plugin -> `src/generated/abis.ts`)
3. `pnpm -r typecheck` - compile errors on both server and web are the intended signal of a changed signature.
Run `scripts/check-abi-fresh.sh` (bundled) to verify generated ABIs match `out/`.

## Checklist for a new event/endpoint
Add schema -> add to `ServerEvent` union -> update web `realtime-bridge` handler -> add fixture + parse test.
