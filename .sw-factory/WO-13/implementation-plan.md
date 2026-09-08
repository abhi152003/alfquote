<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-13

**Work Order:** WO-13 — Implement protected swap construction and simulation
**Created At (UTC):** 2026-09-08T20:34:55Z

## Summary

Implement the read-only protected swap service in `swap.ts` (WO-13's module):
`planProtectedSwap` (UR v2 `V4_SWAP` calldata from a typed PoolKey + quote-derived
minimum, validated explicit slippage, empty `hookData`) and `simulateProtectedSwap`
(`eth_call`/`estimateGas` at an optional explicit block from a caller-supplied address,
decoded failure evidence, allowance blockers). Dry-run only — no signing, wallet
clients, or broadcasting anywhere.

## Code Reuse And Package Structure

Reuse: `encodeV4ExactInSingleExecute`/`amountOutMinimumFromQuote`/`DEFAULT_SLIPPAGE_BPS`
(v4Swap), `simulateUniversalRouterExecute`/`decodeRevert` (simulateSwap), `readSwapAllowances`/
`allowanceBlockers` (allowances), WO-9 contracts (envelopes, `errorMessage`, codes),
WO-11/12 guard/pin pattern, phase1 fixture in tests (golden calldata already pinned in
`test/v4Swap.test.ts`).

New in `src/swap.ts`: `SWAP_ERROR_CODES`/`SWAP_WARNING_CODES`, `SwapPlanArgs`,
`SwapSimulationArgs`, `SwapPlan` (extends the WO-9 `ProtectedSwapPlan` shape with
slippage provenance), `SwapSimulationReport` (state block, gas, decoded revert,
blockers, assumptions), `planProtectedSwap` (pure — no client needed beyond none),
`simulateProtectedSwap` (client). `src/simulateSwap.ts` gets `errorMessage` routing for
its raw `.message` sites (the deferred WO-10 advisory A-6). Tests:
`test/swapService.test.ts`, `test/surface/swap.test.ts` allowlist.

## Components And Flow

planProtectedSwap (no RPC): validate slippage in [0, 10000) — the raw quote is never a
default bound (slippage REQUIRED or the 50 bps default with an explicit opt-in flag);
derive `amountOutMinimum` from the caller's quote; encode V4_SWAP /
SWAP_EXACT_IN_SINGLE / SETTLE_ALL / TAKE_ALL with empty hookData; return the exact
commands, actions, inputs, calldata, deadline input, and assumptions.
simulateProtectedSwap: chain guard + pin → allowances (balance, ERC-20→Permit2,
Permit2→router; failures → error) → simulation via `simulateUniversalRouterExecute` at
the block → decode revert names + nested causes + raw data + correctability →
ok(SwapSimulationReport) with explicit `stateBlockUsed`, "no future execution
certainty" warning, and blockers that must not be bypassed.

## Steps

1. Plan; WO-13 → in_progress. 2. Implement swap.ts + simulateSwap sanitize. 3. Tests
(golden calldata, blockers, success, revert decoding, no-send boundary). 4. Matrix +
gates + live read-only simulation from an allowanced mainnet address fails closed
correctly from the clean test address (expected AllowanceExpired — same as Phase 1).
5. Review round(s); artifacts; in_review; commit.

## Testing

`npm run type-check/build/test`, both gates; the Phase 1 no-send boundary must keep
passing (no send/signer APIs added); live read-only dry-run of the fixture swap via the
built package (one-off script, deleted).
