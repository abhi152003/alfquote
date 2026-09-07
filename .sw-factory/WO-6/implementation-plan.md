<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-6

**Work Order:** WO-6 — Close the Phase 1 simulation and reproducibility gaps
**Created At (UTC):** 2026-09-07T14:44:50Z

## Summary

Close remaining Phase 1 gaps: configurable exact-in sizes and a shared optional block pin; quote-versus-fill evidence at 1, 5, 10, and 100 USDC; a golden Universal Router calldata vector; checked-in upstream source for interface IDs and PoolManager slots; IHookStats reported as a discrepancy; near-zero vanilla `L` required for PROCEED; a stronger no-send gate; and a release command that exits 0 only on a successful protected simulation. The pin file ends with PASS, REVISE, or NO-GO.

## Code Reuse And Package Structure

Reuse the existing spike/proof/simulate path. Add shared run options instead of a second product surface.

| Path | Change |
| --- | --- |
| `src/runOptions.ts` | Shared amount (USDC units) and optional block number from env/argv |
| `src/proofDecision.ts` | STOP when vanilla `L` is above near-zero |
| `src/addresses.ts` | Permalink constants for upstream source files |
| `src/pool.ts` | Keep `POOLS_SLOT` / `LIQUIDITY_OFFSET`; cite checked-in excerpt |
| `scripts/verify-mainnet.ts` | Honor pinned block; IHookStats as discrepancy not compatibility success |
| `scripts/prove-liquidity.ts` | Configurable amount; shared block; vanilla `L` in `decideProof` |
| `scripts/simulate-swap.ts` | Configurable amount; shared block; exit 0 only on success |
| `scripts/sweep-sizes.ts` | 1/5/10/100 USDC quote + sim table at one block |
| `scripts/release.sh` | Type-check, build, test, no-send, spike, proof, intended simulate |
| `scripts/check-no-send.sh` | Broader broadcast/signer/override patterns |
| `docs/upstream/` | Checked-in IALFHook, IHookStats, StateLibrary excerpts + permalinks |
| `docs/pins.md`, `README.md` | Size table, archive vs latest-state, Phase 1 decision |
| `test/*` | Golden calldata equality, vanilla `L` STOP, run-option parsing, no-send patterns |

## Components And Flow

```
env/argv (amount, block)
  -> spike / proof / simulate / sweep  (same pin, empty hookData, UR v2)
  -> indicative quote
  -> amountOutMinimum = quote * (1 - 50 bps)
  -> simulate Universal Router execute
  -> success  => release may pass
  -> revert   => classify; diagnostic path never feeds release
```

Proof PROCEED requires live pool, near-zero vanilla `L`, positive effective liquidity, positive empty-hookData quote, populated slot0.

Compatibility report: IALFHook support is a pass/fail; missing IHookStats advertisement is a discrepancy (info), not a successful compatibility state. Stats views remain defensive calls.

## Steps

1. Shared `loadRunOptions` (amount + optional block) and wire spike/proof/simulate.
2. `decideProof` STOP on vanilla `L` above `NEAR_ZERO_VANILLA_LIQUIDITY`; tests.
3. IHookStats discrepancy reporting; upstream source files and permalinks.
4. Independent golden UR calldata literal + nested decode equality tests.
5. Sweep script for 1/5/10/100 USDC; strengthen no-send; `npm run release` vs diagnostic simulate.
6. Live re-run at one recorded block; write quote-vs-fill table; Phase 1 PASS/REVISE/NO-GO.

## Testing

- `test/runOptions.test.ts`: amount/block parsing; fail-closed on bad values
- `test/proofDecision.test.ts`: STOP when vanilla `L` > 10
- `test/v4Swap.test.ts`: encoder output equals a hardcoded golden hex; nested PoolKey, direction, amounts, empty `hookData`, settle/take
- `test/interfaceId.test.ts`: ids match checked-in source comments
- `npm run type-check`, `npm test`, `bash scripts/check-no-send.sh`
- Manual (`.env`): `npm run spike`, `proof`, `simulate`, `sweep` at an explicit block
