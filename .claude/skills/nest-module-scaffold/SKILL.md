---
name: nest-module-scaffold
description: Scaffold a new NestJS module in apps/server following AgentShield's modular-monolith conventions (module/controller/processor/service/repository, pure domain/ folder, optional port+adapters, registration in the api or worker app module). Invoke manually with the module name when adding a feature module.
argument-hint: "<module-name> [--port] [--queue <name>] [--process api|worker|both]"
disable-model-invocation: true
allowed-tools: Read Write Edit Glob Grep Bash(pnpm *)
metadata:
  owner: FS2
  source: docs/architecture/codebase.md section 4
---

# Scaffold a module: $ARGUMENTS

1. Parse arguments. Refuse a name that already exists under `apps/server/src/modules/`.
2. Create `apps/server/src/modules/<name>/` with only what is needed:
   - `<name>.module.ts` - exports the providers other modules may use (the only cross-module surface).
   - `<name>.service.ts` - application logic.
   - `<name>.controller.ts` - only if HTTP is needed (api process).
   - `<name>.processor.ts` - only if consuming a BullMQ queue (`@Processor('<queue>')`, extend `WorkerHost`); set `concurrency: 1` for anything that signs.
   - `<name>.repository.ts` - only if this module **owns** a table (one owner per table).
   - `domain/` - pure TypeScript + `*.spec.ts` (Vitest). No `@nestjs/*`, `viem`, `drizzle` imports.
   - `<name>.port.ts` + `adapters/` - **only** for external systems (explainer, simulator, tx-sender). Otherwise a plain service; do NOT add UseCase classes, repository interfaces, or mappers.
3. Register in the right app module: HTTP/SSE -> `api-app.module.ts`; queue consumers, schedulers, indexer -> `worker-app.module.ts`; shared -> both. Never import a worker-only module into the API process.
4. Validate DTOs with `nestjs-zod` using schemas from `packages/shared` (no class-validator).
5. Boundary check: no import from another module's internals, no import of `modules/` from `core/`, no foreign table queries. Run `pnpm --filter server lint` (eslint-plugin-boundaries) and `pnpm --filter server test`.
6. Report the files created and which process(es) load the module.

Conventions and rationale: [agentshield-invariants](../agentshield-invariants/SKILL.md) rule 8 and `docs/architecture/codebase.md` section 4.
