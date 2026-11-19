FROM ghcr.io/foundry-rs/foundry:stable

# Fork of Avalanche Fuji (chain id 43113), used only for simulation. Reset per job by the server.
ENV FORK_URL=""
# Fail fast on a slow public RPC instead of Anvil's defaults (45 s per request, 5 retries = minutes of a stuck
# fork). The server then retries the reset on the next Fuji RPC (AnvilSimulator forkUrls).
ENV FORK_TIMEOUT_MS="8000"
ENV FORK_RETRIES="1"
EXPOSE 8545

ENTRYPOINT ["/bin/sh", "-c", "exec anvil --host 0.0.0.0 --port 8545 --chain-id 43113 --fork-url \"$FORK_URL\" --timeout \"$FORK_TIMEOUT_MS\" --retries \"$FORK_RETRIES\""]
