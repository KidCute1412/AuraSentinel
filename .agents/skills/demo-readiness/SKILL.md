---
name: demo-readiness
description: Run the pre-demo preflight and rehearsal checklist for AgentShield (bring-up order, seeding, demo mode, fallback checks, 3-minute script). Invoke manually before a rehearsal or the live pitch.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(docker compose *) Bash(pnpm seed *) Bash(curl *) Bash(forge test *)
metadata:
  owner: all
  source: docs/architecture/system-design.md section 9
---

# Demo preflight

Work through the list, run what can be run, and report PASS/FAIL per item with the evidence. Do not "fix" by editing policy or keys without telling the user. Never print secrets.

## 1. Bring-up order
faucet AVAX (owner + agent) -> MockUSDC + TJ pool -> Safe deployed -> module deployed -> owner `enableModule` + `setPolicy` (500/tx, 1500/day) -> `docker compose -f infra/docker-compose.yml up -d` -> `pnpm seed --verify` -> open `localhost:3000`.

## 2. Checks
- [ ] `.env` loads (Zod env schema boots both api and worker); `AGENT_PRIVATE_KEY` is the session key, not owner.
- [ ] Safe holds seeded USDC/WAVAX; agent EOA has gas AVAX (needed for red-team #4 revert).
- [ ] `GET /state`: policy matches 500/1500, `isActive=true`, budget 0/1,500.
- [ ] Rebalancer **paused** (demo mode) - only manual button runs.
- [ ] Happy path: Run Rebalance 200 USDC -> green card, bar 200/1,500, "13,3%".
- [ ] Red #1..#4 each blocked; #4 shows a Snowtrace link of a reverted tx and Safe balance unchanged.
- [ ] Injection box: verdict unchanged.
- [ ] Gemini fallback: block network/invalid key -> template shows in <2 s with badge `template`.
- [ ] RPC fallback: primary RPC failing still works.
- [ ] Kill-Switch with API stopped still works from the browser; finality time shown (~1.5 s). Re-enable policy afterwards.
- [ ] `forge test --fuzz-runs 10000` green; screenshot ready.
- [ ] Day rollover: UTC 00:00 = 07:00 Vietnam; avoid demoing across it.
- [ ] Backup: second laptop/cloud deployment reachable; recorded video of the 3-minute run.

## 3. Script (3 min)
1. Normal op: Run Rebalance 200 USDC (sim ~0.3 s, green, bar 200/1,500).
2. Attack: red #1 (Shield 1), red #4 (Shield 2 revert on explorer).
3. Kill-Switch, show 10,000 green fuzz runs, close.
