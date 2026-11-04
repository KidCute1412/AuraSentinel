# Threat -> defense matrix

| Threat | Shield 1 (off-chain, bypassable) | Shield 2 (on-chain, always) | Demo |
|---|---|---|---|
| T1 LLM hallucination | Rebalancer is pure math; numeric-consistency check on explanation | per-token caps | - |
| T2 Prompt injection | input in `<untrusted_input>`; LLM has no authority | recipient hard-coded `address(safe)`; caps | injection box |
| T3 Stolen session key, direct on-chain call | none (bypassed by design) | 5 gates + per-token caps + Kill-Switch (~1.5s) | red button #4 |
| T4 Unlimited approval | precheck: approval == amountIn | module approves exact `amountIn`; agent is not a Safe module -> `GS104` | red button #3 |
| T5 Backend down/compromised | none | all rules on chain; Kill-Switch signed in browser | kill with server off |
| T6 Pool price manipulation | slippage check via `getAmountsOut` | `minOut > 0`, balance-delta check; stretch: Chainlink floor | - |
| T7 Owner key leak | out of scope | roadmap: Safe 2/3 multisig owner | state honestly |

## Five gates of `executeGuardedSwap`
1. `msg.sender == agentSigner`, `isActive`, not expired -> `UnauthorizedAgent` / `PolicyInactive`
2. tokens whitelisted -> `TokenNotWhitelisted`
3. `amountIn <= maxPerTx` (per token) -> `ExceedsPerTxCap`
4. `spentInDay[token][today] + amountIn <= dailyCap` -> `ExceedsDailyCap`
5. exact approve + swap with recipient `address(safe)`, path built inside module

## Red-team buttons
1 over-withdraw 2,000 -> precheck + sim revert. 2 wrong recipient -> precheck; no recipient param on-chain. 3 unlimited approval -> `GS104`. 4 bypass website -> `ExceedsPerTxCap` on-chain with Snowtrace link.
