#!/usr/bin/env bash
# Exits 0 only when spike, proof, and the 1 USDC protected simulate succeed.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm run type-check
npm run build
npm test
bash scripts/check-no-send.sh
npm run spike
npm run proof
npm run simulate -- --amount 1
echo "Phase 1 release passed."
