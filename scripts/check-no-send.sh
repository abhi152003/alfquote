#!/usr/bin/env bash
# Phase 1 no-send + controlled-fork boundary gate.
#
# 1. Mainnet-path files (the product packages and the read-only evidence
#    scripts under scripts/phase1 and scripts/lib) must not mention broadcast,
#    signer, or state-override APIs — and must not mention Tenderly at all,
#    so mutation helpers cannot leak into the read-only path.
# 2. Controlled-fork files (scripts/tenderly) may use Admin RPC methods, but
#    must not sign, hold keys, or broadcast pre-signed transactions (unsigned
#    Virtual Environment sends only).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

send_pattern='writeContract|sendTransaction|sendRawTransaction|eth_sendRawTransaction|eth_sendTransaction|createWalletClient|privateKeyToAccount|mnemonicToAccount|hdKeyToAccount|generatePrivateKey|signTypedData|signMessage|signTransaction|stateOverride|stateDiff|sendCalls|walletClient'
signer_pattern='createWalletClient|privateKeyToAccount|mnemonicToAccount|hdKeyToAccount|generatePrivateKey|signTypedData|signMessage|signTransaction|sendRawTransaction|eth_sendRawTransaction'
tenderly_methods='tenderly_setBalance|tenderly_addBalance|tenderly_setErc20Balance|tenderly_addErc20Balance|tenderly_setMaxErc20Balance|tenderly_setStorageAt|tenderly_setCode|eth_sendTransaction|evm_snapshot|evm_revert|evm_increaseTime|evm_setNextBlockTimestamp'

mapfile -t mainnet_files < <(find "$root/packages/alfquote/src" "$root/packages/cli/src" "$root/scripts/phase1" "$root/scripts/lib" -type f \( -name '*.ts' -o -name '*.sh' \) 2>/dev/null || true)
mapfile -t tenderly_files < <(find "$root/scripts/tenderly" -type f -name '*.ts' 2>/dev/null || true)

status=0

# Fail closed on TypeScript files that sit directly under scripts/ and would
# escape the scoped mainnet/controlled-fork trees above.
mapfile -t stray_script_files < <(find "$root/scripts" -maxdepth 1 -type f -name '*.ts' 2>/dev/null || true)
if [ "${#stray_script_files[@]}" -gt 0 ]; then
  echo "FAIL: TypeScript files directly under scripts/ escape the scoped gates; move them into scripts/phase1, scripts/lib, or scripts/tenderly:" >&2
  printf '%s\n' "${stray_script_files[@]}" >&2
  status=1
fi

if [ "${#mainnet_files[@]}" -gt 0 ] && grep -E "$send_pattern" "${mainnet_files[@]}" >/dev/null; then
  echo "FAIL: broadcast, signer, or state-override APIs found in mainnet-path files:" >&2
  grep -n -E "$send_pattern" "${mainnet_files[@]}" >&2 || true
  status=1
fi

if [ "${#mainnet_files[@]}" -gt 0 ] && grep -i -E 'tenderly' "${mainnet_files[@]}" >/dev/null; then
  echo "FAIL: mainnet-path files must not reference Tenderly (read-only boundary):" >&2
  grep -n -i -E 'tenderly' "${mainnet_files[@]}" >&2 || true
  status=1
fi

if [ "${#tenderly_files[@]}" -gt 0 ] && grep -E "$signer_pattern" "${tenderly_files[@]}" >/dev/null; then
  echo "FAIL: signer or raw-broadcast APIs found in controlled-fork files:" >&2
  grep -n -E "$signer_pattern" "${tenderly_files[@]}" >&2 || true
  status=1
fi

# Admin method names may exist only on the controlled-fork path.
if [ "${#mainnet_files[@]}" -gt 0 ]; then
  offenders=$(grep -l -E "$tenderly_methods" "${mainnet_files[@]}" || true)
  if [ -n "$offenders" ]; then
    echo "FAIL: Virtual Environment admin methods found outside scripts/tenderly/:" >&2
    echo "$offenders" >&2
    status=1
  fi
fi

if [ "$status" -ne 0 ]; then
  echo "Phase 1 no-send gate failed." >&2
  exit 1
fi
echo "Phase 1 no-send gate passed (mainnet read-only + controlled-fork boundary enforced)."
