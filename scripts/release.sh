#!/usr/bin/env bash
# Exits 0 only when offline checks, mainnet read-only evidence (spike + proof),
# and the controlled-fork protected swap (`npm run fork`, 1 USDC at 50 bps) pass.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm run type-check
npm run build
npm test
bash scripts/check-no-send.sh
npm run spike
npm run proof
npm run fork
echo "Phase 1 release passed (mainnet read-only + controlled-fork execution)."
