# Glossary

| Term | Meaning | VN |
|---|---|---|
| Safe | Vault holding USDC + WAVAX; no AI holds its key | Két sắt |
| Session key / agent signer | Limited, revocable key for the bot | Thẻ phụ của AI |
| AgentPolicyModule | Solidity module enforcing the 5 gates (Shield 2) | Ổ khóa tự động |
| Kill-Switch | Owner tx setting `isActive=false` (`PolicyRevoked`) | Khóa khẩn cấp |
| Anvil fork | Local fork of Fuji used to simulate a tx | Phòng chạy thử |
| Exact approval | Approve exactly `amountIn`, never MAX | Cấp tiền lẻ vừa đủ |
| dayId | `block.timestamp / 1 days` (UTC); daily cap resets without cron | Mã ngày |

## Demo numbers
maxPerTx 500 USDC · dailyCap 1,500 USDC · rebalance demo 200 USDC (= 13.3% of daily cap) · attack amount 2,000 USDC · explain timeout 2 s · rebalancer tick 15 s · USDC 6 decimals, WAVAX 18.

## Tokens/venue
USDC (MockUSDC on Fuji, own pool) <-> WAVAX via Trader Joe V1 Router. Fuji ~1.5 s finality, no reorg handling needed.
