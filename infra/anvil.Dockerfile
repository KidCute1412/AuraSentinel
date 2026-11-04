FROM ghcr.io/foundry-rs/foundry:stable

# Fork of Avalanche Fuji (chain id 43113), used only for simulation. Reset per job by the server.
ENV FORK_URL=""
EXPOSE 8545

ENTRYPOINT ["/bin/sh", "-c", "exec anvil --host 0.0.0.0 --port 8545 --chain-id 43113 --fork-url \"$FORK_URL\""]
