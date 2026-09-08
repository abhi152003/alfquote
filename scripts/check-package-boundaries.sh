#!/usr/bin/env bash
# Library package-boundary gate.
#
# packages/alfquote is the reusable product library. Its source must stay
# free of interface-layer and execution-layer concerns:
#   - no environment or argv reads, no console output, no process exits
#   - no filesystem, OS, or process builtins
#   - no signers, wallet clients, signing, or broadcasting of any kind
#   - no state overrides and no controlled-fork (Tenderly) references,
#     which also confines Admin RPC method names to the evidence path
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
lib_src="$root/packages/alfquote/src"

if [ ! -d "$lib_src" ]; then
  echo "FAIL: $lib_src does not exist." >&2
  exit 1
fi

mapfile -t lib_files < <(find "$lib_src" -type f -name '*.ts')

if [ "${#lib_files[@]}" -eq 0 ]; then
  echo "FAIL: no library sources found under $lib_src." >&2
  exit 1
fi

interface_pattern='process\.|console\.'
builtin_pattern="from ['\"]node:|from ['\"](fs|os|process|path|child_process|http|https|crypto|net|dns|repl|tty|v8|vm|worker_threads|cluster|zlib|stream|events|buffer)['\"]|require\\("
signer_pattern='createWalletClient|privateKeyToAccount|mnemonicToAccount|hdKeyToAccount|generatePrivateKey|signTypedData|signMessage|signTransaction|walletClient'
broadcast_pattern='writeContract|sendTransaction|sendRawTransaction|eth_sendRawTransaction|eth_sendTransaction|sendCalls|stateOverride|stateDiff'

status=0

for pattern_name in interface builtin signer broadcast; do
  case "$pattern_name" in
    interface) pattern="$interface_pattern" ;;
    builtin) pattern="$builtin_pattern" ;;
    signer) pattern="$signer_pattern" ;;
    broadcast) pattern="$broadcast_pattern" ;;
  esac
  offenders=$(grep -l -E "$pattern" "${lib_files[@]}" || true)
  if [ -n "$offenders" ]; then
    echo "FAIL: $pattern_name concerns found in the library source:" >&2
    echo "$offenders" >&2
    status=1
  fi
done

if grep -l -i 'tenderly' "${lib_files[@]}" >/dev/null 2>&1; then
  echo "FAIL: the library must not reference the controlled-fork provider:" >&2
  grep -l -i 'tenderly' "${lib_files[@]}" >&2 || true
  status=1
fi

if [ "$status" -ne 0 ]; then
  echo "Package boundary gate failed." >&2
  exit 1
fi
echo "Package boundary gate passed (library stays reusable and side-effect free)."
