<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-4

**Work Order:** WO-4 — Simulate a protected Universal Router swap
**Created At (UTC):** 2026-09-07T09:37:23Z

## Summary

Encode one exact-input single-hop Universal Router `V4_SWAP` for the pinned DualPool fixture, using empty `hookData` and `amountOutMinimum` from the live indicative quote minus an explicit slippage bps. Inspect ERC-20 and Permit2 allowances without changing them, simulate `execute` against current mainnet state, and record calldata, blocks, gas or decoded revert, and reproduction commands. Dry-run only.

## Code Reuse And Package Structure

Reuse: `loadSpikeConfig` / `createMainnetClient`, pinned `PINNED_POOL_KEY` / fixture hook, `getIndicativeQuoteSafe` / `readMaxGas` / `readErc20Info`, `maskRpcUrl` / `redactKeys`, Vitest + ABI JSON pins.

New/modified:

| Path | Purpose |
| --- | --- |
| `src/addresses.ts` | Pin Universal Router and Permit2 |
| `src/abi/IUniversalRouter.json`, `IPermit2.json`, `IERC20.json` | execute / allowance / balance pins |
| `src/abis.ts` | Typed views of those ABIs |
| `src/v4Swap.ts` | Encode `V4_SWAP` + `SWAP_EXACT_IN_SINGLE` / `SETTLE_ALL` / `TAKE_ALL`; slippage bound |
| `src/allowances.ts` | Read ERC-20→Permit2 and Permit2→router without writing |
| `src/simulateSwap.ts` | `eth_call` / `simulateContract` of `execute`; decode reverts |
| `scripts/simulate-swap.ts` | Orchestration; `npm run simulate` |
| `test/v4Swap.test.ts` | Encoding vectors (commands, actions, empty hookData, min-out) |
| `docs/pins.md`, README, `.env.example` | Evidence and `ALFQUOTE_SIMULATION_FROM` |

Pinned encoding matches **Universal Router v2** at `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` (`ExactInputSingleParams` **without** `minHopPriceX36`). Current v4-periphery main adds that field (UR 2.1.1). If the live router rejects the v2 struct, retry with `minHopPriceX36 = 0` and record which encoding it accepted.

## Components And Flow

```text
scripts/simulate-swap.ts
  -> quote at block Q (WO-3 path, 100 USDC exact in, empty hookData)
  -> amountOutMinimum = quote * (10000 - slippageBps) / 10000
  -> encode execute(commands=0x10, inputs=[abi.encode(actions=0x060c0f, params)])
  -> read sender USDC balance, ERC-20 allowance to Permit2, Permit2 allowance to UR
  -> simulate execute from sender at block S
  -> success: record output + gas; failure: decode revert, mark correctable vs not
  -> never send, never approve
```

Slippage default 50 bps, overridable via `ALFQUOTE_SLIPPAGE_BPS`. Sender via `ALFQUOTE_SIMULATION_FROM` (required for simulation; encoding still runs if unset, then simulation is a recorded blocker).

## Steps

1. ABI pins + addresses for UR / Permit2 / ERC-20.
2. Pure encoder + slippage helper + unit tests.
3. Allowance readers + simulate wrapper (no writes).
4. `npm run simulate` script, pins.md section, README row.
5. Live run; record success or decoded revert.
6. Review.

## Testing

- `test/v4Swap.test.ts`: commands `0x10`, actions `0x060c0f`, empty hookData, `amountOutMinimum < quote` at 50 bps, v2 struct has no `minHopPriceX36`.
- `npm run type-check`, `npm test`.
- `npm run simulate` with `.env` (manual).
