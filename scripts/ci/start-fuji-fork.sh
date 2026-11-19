#!/usr/bin/env bash
# Starts an Anvil fork of Fuji on 127.0.0.1:${PORT:-8545} in the background, logging to ${LOG:-anvil.log}.
# Public Fuji RPCs sometimes rate-limit or time out from GitHub runners; anvil then exits during the
# initial fork fetch. So: try each RPC in turn, a few rounds, restarting anvil when it dies.
set -u
PORT="${PORT:-8545}"
LOG="${LOG:-anvil.log}"
URL="http://127.0.0.1:$PORT"
RPCS=(
  "https://api.avax-test.network/ext/bc/C/rpc"
  "https://avalanche-fuji-c-chain-rpc.publicnode.com"
  "https://rpc.ankr.com/avalanche_fuji"
)

for round in 1 2 3; do
  for rpc in "${RPCS[@]}"; do
    echo "round $round: forking $rpc"
    : > "$LOG"
    anvil --fork-url "$rpc" --retries 10 --timeout 60000 --chain-id 43113 --port "$PORT" >> "$LOG" 2>&1 &
    pid=$!
    for _ in $(seq 1 30); do
      if cast block-number --rpc-url "$URL" > /dev/null 2>&1; then
        echo "anvil fork up on $URL (from $rpc)"
        exit 0
      fi
      kill -0 "$pid" 2> /dev/null || break
      sleep 2
    done
    echo "fork via $rpc failed; anvil log:"
    tail -n 20 "$LOG"
    kill "$pid" 2> /dev/null
    wait "$pid" 2> /dev/null
  done
  sleep $((round * 5))
done
echo "could not start a Fuji fork from any RPC"
exit 1
