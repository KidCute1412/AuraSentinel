# AgentShield

Safe vault + on-chain policy module that lets an AI agent trade 24/7 without being able to take funds. Avalanche Fuji. 3-week hackathon, demo must never fail.

Docs index: `docs/README.md`. Source of truth: `docs/architecture/system-design.md` (system), `docs/architecture/codebase.md` (code layout), `docs/architecture/contracts.md` (Solidity spec). Ops: `docs/runbook/`. Pitch/judging: `docs/product/pitch.md`.

## Stack
pnpm workspaces + Turborepo · `apps/server` NestJS 11 (entrypoints: api, worker) · `apps/web` Vite + React 19 + wagmi/viem · `packages/contracts` Foundry · `packages/shared` Zod schemas + generated ABIs · BullMQ/Redis · Postgres + Drizzle · Anvil fork · Gemini 2.5 Flash.

## Non-negotiables (details: skill `agentshield-invariants`)
1. Chain is the source of truth; never mirror policy/spend state in Postgres.
2. Kill-Switch and setPolicy are signed by the owner in the browser, never via backend.
3. The LLM only writes `messageVi`; verdict, amounts, signing are deterministic.
4. All money is `bigint`/string in base units. No floats.
5. Only `modules/execution` touches the session key. Owner key never enters backend/env.
6. All UI follows `docs/product/design-system.md` ("Sentinel Terminal": dark, square corners, hard shadows, green accent with red reserved for danger, Hanken Grotesk + Geist Mono). Read skill `ui-design-system` before touching `apps/web`; no colors, fonts or rounded corners outside its tokens.

## Skills
Source of truth: `.agents/skills/` (read by Codex, Antigravity and other agents). `.claude/skills/` is a generated mirror for Claude Code: never edit it; after changing a skill run `node scripts/sync-skills.mjs` (CI runs `--check`). Third-party provenance: `.agents/skills/THIRD_PARTY.md`.

| Touching | Skill | Owner |
|---|---|---|
| anything | `agentshield-invariants` | all |
| `packages/contracts` | `policy-module-contract`, `secure-workflow-guide` | FS1 |
| `packages/shared` | `shared-contract-sync` | FS1 + AIE |
| new NestJS module | `nest-module-scaffold` (manual), `nestjs-best-practices` | FS2 |
| auditor / simulation / rebalancer | `auditor-pipeline` | AIE + FS2 |
| explainer | `llm-explainer-guard` | AIE |
| redteam | `redteam-scenarios` | AIE |
| execution / `core/chain` | `tx-execution`, `viem` | FS2 |
| `apps/web` | **`ui-design-system` (mandatory, wins on aesthetics)**, `web-dashboard`, `wagmi`, `frontend-design`, `shadcn-ui`, `react-best-practices`, `composition-patterns`, `webapp-testing` | FS2 |
| before demo | `demo-readiness` (manual) | all |
| before merge | `design-review` (manual), `web-design-guidelines` (UI) | all |

Frontmatter such as `paths`, `disable-model-invocation`, `context`, `argument-hint` and `$ARGUMENTS` is Claude Code specific; other agents ignore it, so invoke the three manual skills by name. `agentshield-invariants` overrides third-party advice; `ui-design-system` overrides third-party aesthetic advice (`frontend-design`, shadcn defaults). `wagmi` skill targets v3 while our docs say v2: pin the version first.

## Commands (once scaffolded)
`pnpm dev` · `pnpm --filter shared gen` (ABIs) · `forge test` / `forge test --fuzz-runs 10000` in `packages/contracts` · `docker compose -f infra/docker-compose.yml up` · `pnpm seed --verify`.

Language: code and comments in English; `docs/` are written in Vietnamese (technical identifiers stay English); user-facing explanation strings in Vietnamese.
