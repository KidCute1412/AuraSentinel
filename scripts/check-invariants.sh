#!/usr/bin/env bash
# Cheap static guards for AgentShield invariants (see skill agentshield-invariants).
set -u
fail=0
report() { echo "::error::$1"; fail=1; }

# P4: no floats for money in server code
if grep -rnE "parseFloat|\.toFixed\(" apps/server/src --include=*.ts 2>/dev/null; then
  report "P4: float usage in apps/server/src (money must be bigint/string)"
fi

# P5: owner key never in backend/env/infra
if grep -rniE "OWNER_(PRIVATE_)?KEY" apps/server infra .github --include=* \
     --exclude-dir=node_modules --exclude-dir=dist --exclude=ci.yml --exclude=check-invariants.sh 2>/dev/null; then
  report "P5: owner key reference found in backend/infra"
fi

# P5: only modules/execution may reference the session key
if grep -rnE "SESSION_(PRIVATE_)?KEY|privateKeyToAccount" apps/server/src --include=*.ts 2>/dev/null \
   | grep -vE "^apps/server/src/(modules/execution|core/chain|config)/" ; then
  report "P5: session key referenced outside modules/execution | core/chain | config"
fi

# P2: kill-switch / setPolicy must not be sent from backend
if grep -rnE "functionName: *['\"](killSwitch|setPolicy)['\"]" apps/server/src --include=*.ts 2>/dev/null; then
  report "P2: backend must not sign killSwitch/setPolicy"
fi

# committed secrets
if git ls-files | grep -E "(^|/)\.env($|\.)" | grep -vE "\.example$"; then
  report "committed .env file"
fi

exit $fail
