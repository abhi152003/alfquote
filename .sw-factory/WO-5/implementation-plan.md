<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-5

**Work Order:** WO-5 — Harden Phase 1 evidence and add the release gate
**Created At (UTC):** 2026-09-07T10:00:00Z

## Summary

Close Phase 1 evidence gaps: pin or label every read, known-answer interface IDs, explicit IHookStats discrepancy, empty-`hookData` and UR v2 as the only release gates, nested encoding/revert tests, slot0 fail-closed, quote-vs-execution documentation, and CI that type-checks, tests, and forbids send paths without RPC secrets.

## Code Reuse And Package Structure

Reuse existing spike/proof/simulate modules. Change behavior in place rather than adding a second product surface.

| Path | Change |
| --- | --- |
| `src/pool.ts`, `src/addresses.ts` | Export `POOLS_SLOT`, `LIQUIDITY_OFFSET`, `V4_CORE_REVISION` |
| `src/alfQuote.ts` | Empty `hookData` is the quote path; encoded `ALFHookData` diagnostic-only |
| `src/proofDecision.ts` | Empty slot0 is STOP |
| `src/v4Swap.ts` | Decode nested V4_SWAP input for tests |
| `src/simulateSwap.ts` | Nested `ExecutionFailed` decode; correctable from error names |
| `src/allowances.ts` | Covered by unit tests |
| `scripts/verify-mainnet.ts` | Label latest-state vs pinned historical; IHookStats discrepancy |
| `scripts/prove-liquidity.ts` | slot0 blocker; empty hookData gate |
| `scripts/simulate-swap.ts` | v2 only for the gate; record exact simulated calldata; diagnostic slippage label |
| `test/*` | Known-answer IDs, nested encoding, blockers, reverts |
| `.github/workflows/phase1.yml` | npm ci, type-check, build, test, no-send grep |
| `docs/pins.md` | Quote vs sim gap; final Phase 1 decision |

## Components And Flow

Release gate: `npm ci && type-check && build && test && check-no-send`. Mainnet scripts remain local (`ETHEREUM_RPC_URL`). Quote PROCEED requires empty hookData. Simulate records v2 calldata actually submitted. Alternate encodings never flip a min-out/allowance/balance failure to success.

## Steps

1. Constants, interface-id known answers, storage-slot pin + tests.
2. Quote empty-only, slot0 STOP, IHookStats discrepancy, latest-state labels.
3. Nested decode tests, revert classification, allowance tests.
4. Simulate v2-only recording; diagnostic slippage labeling.
5. CI no-send workflow.
6. Re-run spike/proof/simulate; update pins.md.

## Testing

- `test/interfaceId.test.ts`: `0x7adbfbb8`, `0x601b90d3`
- `test/v4Swap.test.ts`: nested PoolKey, direction, amounts, empty hookData, SETTLE_ALL/TAKE_ALL
- `test/allowances.test.ts`, `test/simulateSwap.test.ts`, `test/proofDecision.test.ts` slot0
- `npm run type-check`, `npm test`, `scripts/check-no-send.sh`
- Manual: `npm run spike`, `proof`, `simulate`
