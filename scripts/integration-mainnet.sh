#!/usr/bin/env bash
# Opt-in read-only mainnet integration suite for the Phase 2 CLI journey.
#
# Runs the built CLI through discover -> assess -> quote -> swap dry-run against
# Ethereum mainnet and asserts the documented exit codes and JSON validity.
# Read-only: eth_call / eth_getLogs / eth_getCode / eth_getStorageAt only; the
# swap step is a dry-run from an intentionally clean address (expected exit 5).
#
# Usage: ALFQUOTE_INTEGRATION=1 bash scripts/integration-mainnet.sh
# Requires ETHEREUM_RPC_URL (or pass --rpc) and a prior `npm run build`.
set -euo pipefail

if [ "${ALFQUOTE_INTEGRATION:-0}" != "1" ]; then
  echo "This suite hits mainnet read-only; opt in with ALFQUOTE_INTEGRATION=1." >&2
  exit 1
fi
cd "$(dirname "$0")/.."

CLI=(node --env-file-if-exists=.env packages/cli/dist/main.js)
SENDER="0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309"
FIXTURE_HOOK="0x00000078BD49D5279a99b5F4011a5C61eE8caaC0"
fail=0

check_json() {
  node -e '
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (parsed.schemaVersion !== 1) { console.error("schemaVersion != 1"); process.exit(1); }
      if (typeof parsed.status !== "string" || !Array.isArray(parsed.warnings)) { console.error("bad envelope"); process.exit(1); }
    });
  '
}

step() {
  local name="$1"; shift
  local expect="$1"; shift
  set +e
  "$@" > /tmp/alfquote-integration.out 2>/tmp/alfquote-integration.err
  local code=$?
  set -e
  if [ "$code" -ne "$expect" ]; then
    echo "FAIL $name: expected exit $expect, got $code" >&2
    head -5 /tmp/alfquote-integration.err >&2
    fail=1
    return
  fi
  echo "PASS $name (exit $code)"
}

step "discover (json, exit 0)" 0 "${CLI[@]}" discover --format json
check_json < /tmp/alfquote-integration.out || { echo "FAIL discover: invalid JSON envelope" >&2; fail=1; }

step "assess (json, exit 0)" 0 "${CLI[@]}" assess --hook "$FIXTURE_HOOK" --use-fixture-pool --format json
check_json < /tmp/alfquote-integration.out || { echo "FAIL assess: invalid JSON envelope" >&2; fail=1; }

step "quote (json, exit 0)" 0 "${CLI[@]}" quote --use-fixture-pool --amount 1 --exact-in --format json
check_json < /tmp/alfquote-integration.out || { echo "FAIL quote: invalid JSON envelope" >&2; fail=1; }

step "swap dry-run from clean address (exit 5)" 5 "${CLI[@]}" swap --use-fixture-pool --amount 1 --slippage-bps 50 --sender "$SENDER" --format json
check_json < /tmp/alfquote-integration.out || { echo "FAIL swap: invalid JSON envelope" >&2; fail=1; }

rm -f /tmp/alfquote-integration.out /tmp/alfquote-integration.err
if [ "$fail" -ne 0 ]; then
  echo "Mainnet integration FAILED." >&2
  exit 1
fi
echo "Mainnet integration passed (read-only journey: discover, assess, quote, swap dry-run)."
