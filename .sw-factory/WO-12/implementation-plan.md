<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-12

**Work Order:** WO-12 — Implement the reusable DualPool quote service
**Created At (UTC):** 2026-09-08T20:23:12Z

## Summary

Implement the envelope-returning DualPool quote service in `quote.ts` (WO-12's module):
`quoteExactIn` (liveness-gated, maxGas-bounded, empty-`hookData` exact-input indicative
quotes with decimal-normalized units and distinctly labeled liquidity fields) and
`quoteSwapToPrice` (typed price-bounded view). Fail-closed: zero quotes and dead
liveness are typed skips, never successes; failed stats become null fields plus
warnings, never guessed values; non-binding and size-divergence warnings ship on every
quote.

## Code Reuse And Package Structure

Reuse: `getIndicativeQuoteSafe`/`readHookStats`/`readLiveness`/`readMaxGas` (alfQuote),
`readVanillaLiquidity` (poolState), `readErc20Info`/`Erc20Info` (erc20), `derivePoolId`,
WO-9 contracts (envelopes, `errorMessage`, shared rpc codes), the WO-11 head-pinning
pattern, `PINNED_POOL_KEY`/`FIXTURE_POOL_ID` from `alfquote/phase1` in tests.

New in `src/quote.ts`: `QUOTE_ERROR_CODES`/`QUOTE_WARNING_CODES`, extended
`QuoteSkipCode` (`quote/gas-unavailable`), `QuoteServiceArgs`, `QuoteData`
(direction, zeroForOne, raw + unit-normalized amounts, token infos, gas cap,
`QuoteLiquidity` with three distinct nullable fields), `PriceBoundedQuoteData`,
`quoteExactIn`, `quoteSwapToPrice`. `test/mockClient.ts` gains an `eth_call` route
(recorder + responder) so gas-cap enforcement and negative-`amountSpecified` encoding
are assertable. `test/quoteService.test.ts` + `test/surface/quote.test.ts` allowlist.

## Components And Flow

quoteExactIn: chain guard → pin (pinned or fetched head) → liveness (hook + pool; any
failure or false → typed skip) → maxGas (failure → skip `quote/gas-unavailable`) →
`getIndicativeQuoteSafe` with the fetched gas cap (null/zero → skip
`quote/zero-output`; encoding ≠ empty → skip `quote/view-error`) → token infos
(failure → error `rpc/read-failed`) → liquidity reads (`readHookStats`,
`readVanillaLiquidity`; failures → null + `quote/stats-unavailable` warning) →
ok(QuoteData) with mandatory `quote/non-binding` + `quote/size-divergence` warnings.
quoteSwapToPrice: same guard/pin/liveness, then the `swapToPrice` view with an explicit
`sqrtPriceLimitX96`, typed result, sanitized failures.

## Steps

1. Plan (this file); WO-12 → in_progress. 2. Implement quote.ts. 3. Extend mockClient
(`call` route). 4. Tests (fixture-based sign/direction, skips, gas-cap, stats-null,
units, swapToPrice). 5. Matrix + gates + live mainnet quote of the fixture pool.
6. Review round(s); artifacts; in_review; commit.

## Testing

`npm run type-check/build/test`, both gates; live read-only `quoteExactIn` +
`quoteSwapToPrice` against the pinned USDC/USDT fixture pool (one-off script, deleted);
boundary invariants (no env/console/signing/broadcast; empty hookData on the release
path).
