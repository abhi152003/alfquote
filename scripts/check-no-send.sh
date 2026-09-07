#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
if grep -R -n -E 'writeContract|sendTransaction|sendRawTransaction|createWalletClient|privateKeyToAccount|mnemonicToAccount|stateOverride' \
  --exclude='check-no-send.sh' \
  "$root/src" "$root/scripts"; then
  echo "Phase 1 no-send gate failed: broadcast or signer APIs found." >&2
  exit 1
fi
echo "Phase 1 no-send gate passed."
