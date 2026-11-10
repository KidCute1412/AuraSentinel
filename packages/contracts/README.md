# @agentshield/contracts

Foundry project: `AgentPolicyModule` (Safe module, Shield 2). Spec: [`docs/architecture/contracts.md`](../../docs/architecture/contracts.md).

```bash
git submodule update --init            # lib/forge-std
forge build && forge test              # 10,000 fuzz runs by default; FOUNDRY_PROFILE=ci uses 1,000
node script/export-abi.mjs             # rewrite abi/*.json (CI fails if abi/ is stale)
pnpm --filter @agentshield/shared gen  # abi/*.json -> packages/shared/src/generated/abis.ts
```

Changing a signature, error or event: edit `src/`, run the three commands above, commit `abi/` and the generated
file together, then fix whatever TypeScript reports. `AgentShieldFactory.json` and `MockUSDC.json` come from the
interfaces in `src/interfaces/` until L3 adds the implementations.
