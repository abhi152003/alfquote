#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
pattern='writeContract|sendTransaction|sendRawTransaction|eth_sendRawTransaction|eth_sendTransaction|createWalletClient|privateKeyToAccount|mnemonicToAccount|hdKeyToAccount|generatePrivateKey|signTypedData|signMessage|signTransaction|stateOverride|stateDiff|sendCalls|walletClient'
if grep -R -n -E "$pattern" \
  --exclude='check-no-send.sh' \
  "$root/src" "$root/scripts"; then
  echo "Phase 1 no-send gate failed: broadcast, signer, or state-override APIs found." >&2
  exit 1
fi
echo "Phase 1 no-send gate passed."
