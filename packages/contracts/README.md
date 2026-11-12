# @agentshield/contracts

Foundry project: `AgentPolicyModule` (Safe module, Shield 2), `AgentShieldFactory` (one module per Safe) and
`MockUSDC` (testnet token with a faucet). Spec: [`docs/architecture/contracts.md`](../../docs/architecture/contracts.md).

```bash
git submodule update --init            # lib/forge-std
forge build && forge test              # 10,000 fuzz runs + invariant suite; FOUNDRY_PROFILE=quick uses 1,000
node script/export-abi.mjs             # rewrite abi/*.json (CI fails if abi/ is stale)
rm -f slither.json; slither . --json slither.json; pnpm proof   # rewrite proof/tests.json (CI fails if stale)
pnpm --filter @agentshield/shared gen  # abi/*.json -> packages/shared/src/generated/abis.ts
```

Changing a signature, error or event: edit `src/`, run the three commands above, commit `abi/` and the generated
file together, then fix whatever TypeScript reports.

`proof/tests.json` is the `tests` block of `GET /proof`: fuzz runs, invariant names (from the `invariant_*`
functions in `test/AgentPolicyModule.invariant.t.sol`), totals and the Slither count for `src/`. Regenerate and commit
it whenever you add, remove or rename a test. The invariant handler lives in `test/handlers/PolicyHandler.sol`.
