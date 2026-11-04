#!/usr/bin/env bash
# Fails if packages/shared/src/generated/abis.ts is older than any Foundry artifact.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
gen="$root/packages/shared/src/generated/abis.ts"
out="$root/packages/contracts/out"

[ -f "$gen" ] || { echo "MISSING: $gen - run: pnpm --filter shared gen"; exit 1; }
[ -d "$out" ] || { echo "MISSING: $out - run: forge build"; exit 1; }

stale=$(find "$out" -name '*.json' -newer "$gen" | head -n 1)
if [ -n "$stale" ]; then
  echo "STALE: $stale is newer than abis.ts - run: pnpm --filter shared gen"
  exit 1
fi
echo "OK: generated ABIs are up to date"
