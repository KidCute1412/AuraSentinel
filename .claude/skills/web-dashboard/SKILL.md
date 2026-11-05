---
name: web-dashboard
description: Build the AgentShield Vite + React 19 dashboard - 3-column layout (policy and Kill-Switch, balances before/after and AI explanation, red-team buttons), wagmi/viem owner signing, TanStack Query cache, SSE realtime bridge, shadcn/ui and Tailwind, Framer Motion alerts. Use when working in apps/web - components, hooks, wallet connection, setPolicy/revoke transactions, live budget bar, job timeline, error messages in Vietnamese.
paths: "apps/web/**"
metadata:
  owner: FS2
  source: docs/architecture/codebase.md section 5
---

# Web dashboard

Read [agentshield-invariants](../agentshield-invariants/SKILL.md) rules 1, 2, 5. The web app only displays state and signs with the owner wallet.

**Visual design is mandatory:** read [ui-design-system](../ui-design-system/SKILL.md) (`docs/product/design-system.md`) before any UI work. Look, colors, fonts, shadows and motion come from there; this skill covers layout and logic only.

## Rules
- **Owner actions bypass the backend:** `useSetPolicy` and `useKillSwitch` use wagmi `useWriteContract` against the module. Show measured finality (~1.5 s) on the Kill button. Do not add API calls for kill/policy.
- **Data flow = snapshot + stream:** on load and on SSE reconnect fetch `GET /state` and `GET /jobs`; then apply `ServerEvent` via `queryClient.setQueryData` (no refetch per event). One `EventSource` in `app/realtime-bridge.tsx`, events parsed with `ServerEvent.parse` from `@agentshield/shared`.
- **Features are isolated:** `features/{policy,kill-switch,vault,activity,red-team}` must not import each other; share via `shared/`. Components render; logic lives in hooks.
- **Money:** use shared bigint helpers (`formatUnits`), never `Number()`/float. Daily bar = `spentToday / dailyCap` from chain-sourced `/state`.
- **Forms:** react-hook-form + the policy Zod schema from shared.
- **UI/UX (10% of score):** green card "An toàn, tiêu 13,3% hạn mức ngày" vs red card with reason; badge `llm|template` on explanations; Snowtrace link for reverted txs; Framer Motion flash (<= 200ms, per design-system motion rules) on block/success; Vietnamese error text from `shared/lib/error-messages.ts`. Layout must stay legible on a projector (large type, high contrast).
- **Chain config:** `avalancheFuji`, wagmi `fallback` transports, addresses/ABIs from `@agentshield/shared`. Wallets: Core + MetaMask (RainbowKit).
- **No SSR assumptions:** pure client SPA; no `"use client"`, no Next.js APIs.

## Verify
`pnpm --filter web typecheck && pnpm --filter web test`; for E2E use the `webapp-testing` skill against the running dev server; check kill flow with the API container stopped.
