<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-3

**Work Order:** WO-3 — Prove hook-aware DualPool liquidity and quoting
**Created At (UTC):** 2026-09-07T06:50:12Z

## Summary

Implement the read-only negative-liquidity proof: at one pinned Ethereum block, read the demo pool's three capacity signals — PoolManager vanilla liquidity (via `extsload`), DualPool `getReserves`, and DualPool `getEffectiveLiquidity` — plus hook-level and per-pool liveness, `maxGas()`, and a small exact-input `getIndicativeQuote`. Everything is fail-closed: failed liveness, failed calls, and zero quotes are skips/blockers, never success. The script emits a PROCEED / REVISE / STOP decision and records values, units, block, call parameters, and reproduction commands in `docs/pins.md`. Read-only throughout; simulation stays in WO-4.

## Pinned facts (gathered during context)

- Vanilla liquidity read is canonical v4-core, revision `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`: `StateLibrary.getLiquidity` = `manager.extsload(keccak256(abi.encode(poolId, POOLS_SLOT)) + LIQUIDITY_OFFSET)` with `POOLS_SLOT = 6` (matches the WO-2 empirical discovery) and `LIQUIDITY_OFFSET = 3`; liquidity is the low 128 bits of that word (`Pool.State`: slot0, feeGrowth0, feeGrowth1, liquidity…). `extsload(bytes32)` probed successfully on the deployed mainnet PoolManager.
- Thesis pre-verified while probing: at block `25923810` the demo pool has live price data (slot0 populated, lpFee 10) and vanilla liquidity exactly `0`.
- Hook surface (from the WO-2 pinned ABIs): `isLive()`, `livePools(bytes32)`, `maxGas()` (uint32), `getReserves(key)`, `getEffectiveLiquidity(key)`, `getIndicativeQuote(key, zeroForOne, amountSpecified, hookData)`. `amountSpecified` negative = exact input; `zeroForOne = true` swaps currency0→currency1 (USDC→USDT).
- `IHookStats` is not ERC-165-advertised by the deployed hooks (WO-2 caveat) → reserve/effective reads are attempted defensively and their failure recorded, never guessed around.
- `hookData`: the pinned interface allows empty bytes or `abi.encode(ALFHookData(...))`. Try empty bytes first; on revert, retry with the encoded struct; record which encoding the live hook accepts.
- Token decimals are read live (`decimals()`), never assumed, per docs/ALFQuote.md cautions.

## Code Reuse And Package Structure

Reused: `config.ts` + `createMainnetClient` (chain gate), `abis.ts` (alfHookAbi, hookStatsAbi, dualPoolHookViewsAbi), `addresses.ts` (pinned PoolKey/poolId/hook/USDC/USDT), `hasBytecode`, JSON ABI pins + equivalence test, Vitest harness, spike reporter pattern from `scripts/verify-mainnet.ts`.

New files:

| Path | Purpose |
| --- | --- |
| `src/pool.ts` (extend) | `poolStateSlot(poolId)` pure slot math (reintroduces the WO-2-deleted helper, now product-path) |
| `src/poolState.ts` | `readVanillaLiquidity(client, pm, poolId, blockNumber)` via `extsload`; returns liquidity + raw slot0 word for context |
| `src/erc20.ts` | `readErc20Info` (symbol, decimals) with a minimal metadata ABI |
| `src/alfQuote.ts` | Hook quote surface pinned to one block: `readLiveness`, `readMaxGas`, `readHookStats` (defensive), `getIndicativeQuoteSafe` (gas-capped, records hookData encoding accepted) |
| `src/proofDecision.ts` | Pure PROCEED / REVISE / STOP function (fail-closed matrix covered by unit tests) |
| `src/abis.ts` + `src/abi/IPoolManager.json` (extend) | `extsload(bytes32)` pin |
| `src/abi/IERC20Metadata.json` | decimals/symbol pin |
| `scripts/prove-liquidity.ts` | The proof orchestration + PROCEED/REVISE/STOP decision; exit 0 only on PROCEED |
| `test/poolState.test.ts` | Slot-math vector + low-128 liquidity decode |
| `package.json` | `npm run proof` command |

Modified: `src/index.ts` (exports), `docs/pins.md` (WO-3 section), `README.md` (command row).

## Components And Flow

```text
scripts/prove-liquidity.ts
  -> loadSpikeConfig / createMainnetClient / head block B        (all later reads pinned to B)
  -> readErc20Info(USDC), readErc20Info(USDT)                    (units; decimals read live)
  -> readVanillaLiquidity(PM, poolId, B)                          (signal 1: vanilla, v4 liquidity units)
  -> readLiveness(fixtureHook, poolId, B)                         (gate: isLive && livePools)
  -> readMaxGas(fixtureHook, B)                                   (quote gas bound)
  -> readHookStats(fixtureHook, key, B)                           (signals 2+3: reserves, effective; defensive)
  -> getIndicativeQuoteSafe(hook, key, {zeroForOne: true, amountSpecified: -100 * 10^decimals, gas: maxGas}, B)
  -> decision:
       REVISE  if any read failed (recorded reason)
       STOP    if liveness false / effective liquidity 0 / quote 0 (thesis absent; record, no mocks)
       PROCEED iff effective liquidity > 0 AND quote > 0
  -> pins.md records: values + units + labels, block B, call params, hookData encoding accepted, repro commands
```

Labels are fixed by the blueprint: vanilla = "persistent v4 liquidity active at the current tick (L units)"; reserves = "total economic assets (token raw units)"; effective = "currently usable assets (token raw units)". Reserves are never described as executable capacity.

## Steps

1. **ABIs + pure helpers** — extend `IPoolManager` pin with `extsload`, add `IERC20Metadata` pin, `poolStateSlot`, decode helpers; tests for slot math and decode.
2. **Read modules** — `src/poolState.ts`, `src/erc20.ts`, `src/alfQuote.ts` (block-pinned, defensive stats, gas-capped quote with hookData fallback).
3. **Orchestration** — `scripts/prove-liquidity.ts` with the decision logic; `npm run proof` script; exports.
4. **Run against mainnet** — capture block, values, units, call params; iterate on live-hook surprises (hookData encoding, IHookStats calls).
5. **Evidence + docs** — pins.md WO-3 section, README row.
6. **Verification + review** — type-check, tests, proof run, review delegate, handoff.

Steps 1–3 are file-disjoint; 4–6 sequential.

## Testing

Automated (`npm test`):

- `test/poolState.test.ts`: `poolStateSlot(FIXTURE_POOL_ID)` equals the precomputed keccak vector; liquidity decode masks the low 128 bits of the packed word (vector includes the tickNext/initialized high bits).
- `test/proofDecision.test.ts`: PROCEED only when live + positive effective liquidity + positive quote; REVISE on failed reads; STOP on not-live / zero quote / zero effective liquidity.

Static: `npm run type-check`.

Manual / exploratory (the WO's acceptance surface, with `.env`):

- `npm run proof` → streams every read with its block number; decision PROCEED with exit 0 when the thesis is observed.
- Fail-closed probes (temporary env/constant edits, reverted after): wrong pool id (liveness false), zero-quote hook amount — each must produce a clear skip/stop, not a crash.
- Same-block discipline check: every printed value line carries the identical block number.
- `docs/pins.md` WO-3 section: values match the run output; call parameters (direction, amount raw + human, hookData encoding, gas bound) recorded; reproduction commands present.

Out of scope: Universal Router calldata/simulation (WO-4), live transactions, tick walking, routing/economic-safety claims.
