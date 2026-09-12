# FEEDBACK.md — Uniswap stack feedback from the ALFQuote build

**Project:** [ALFQuote](https://github.com/abhi152003/alfquote) — a TypeScript library and CLI for discovering, assessing, and quoting Uniswap v4 DualPool hooks through `IALFHook` views, plus protected Universal Router v2 swap planning and dry-run simulation.
**Event:** ETHOnline 2026 — Uniswap Best Stack Contribution track.
**Written:** 2026-09-12. Every observed claim below carries a block number or pinned revision and a reproduction command. Documented claims cite the upstream source we built against.

## Stack we built on

| Component | Pin |
| --- | --- |
| Uniswap v4 core (`PoolManager`, `StateLibrary`) | [`v4-core@46c6834`](https://github.com/Uniswap/v4-core/tree/46c6834698c48bc4a463a86d8420f4eb1d7f3b75) |
| v4 hooks repo (`AllowlistedFactory`, `DualPoolHook`, `IALFHook`) | [`v4-hooks-public@0f731d5`](https://github.com/Uniswap/v4-hooks-public/tree/0f731d5de0f4fd60b506b55754d5e6ff086eab7d) (2026-08-19) |
| Universal Router v2 (`V4_SWAP`, actions `SWAP_EXACT_IN_SINGLE`/`SETTLE_ALL`/`TAKE_ALL`) | mainnet `0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Mainnet contracts | factory `0x0000000000077769C332e0D3ed8bC8E02A0cE108`, PoolManager `0x000000000004444c5dc75cB358380D2e3dE08A90` |

Full address/ABI/event pins: [docs/pins.md](docs/pins.md). Contract-map from README claims to implementation: [README.md](README.md#contract-map).

## Feedback

### 1. Vanilla PoolManager liquidity is not DualPool capacity — the integrator gap worth shouting about

- **Documented:** DualPool keeps just-in-time inventory in ERC-4626 vaults and deploys concentrated liquidity only around a swap; official integration guidance requires hook-aware quote views rather than vanilla depth.
- **Observed (Ethereum mainnet, read-only):** at block `25923945` on the pinned USDC/USDT DualPool pool, PoolManager `getLiquidity` = **0** while `slot0` still reports a live price, `getEffectiveLiquidity` = `837470631` USDC raw, and an empty-`hookData` `getIndicativeQuote` for 100 USDC returned `99996353` USDT raw. Re-verified at blocks `25925049`, `25926196`, and `25933348`, and still true today: the live CLI prints `liquidity: vanilla=0 … effective=[...]` at head ([reproduce](#reproduce)).
- **Why it matters:** any router, wallet, or agent that treats vanilla depth as the only capacity signal will conclude this pool is empty and skip it, even though the hook quotes and fills. The information is in the docs, but it is easy to miss because vanilla `getLiquidity` is the habitual integrator call.
- **Suggestion:** surface "vanilla liquidity ≠ capacity for JIT/vault-backed hooks" prominently in the v4 integration docs (a callout on the liquidity/quotes pages), and consider a short official example of reading `getEffectiveLiquidity` alongside `getLiquidity`.

### 2. Hook compatibility must be checked caller-side; one ERC-165 discrepancy found

- **Documented:** `IALFHook` is the quote surface and supports ERC-165 interface detection.
- **Observed:** both hooks we tested advertise `IALFHook` (`supportsInterface(0x7adbfbb8) = true`) but **not** `IHookStats` (`0x601b90d3 = false`) — at block `25920319` on factory registry hook #0 (`0x0000005bb4…`) and on the fixture hook (`0x000078bd…`). The stats views themselves still execute when called directly, so this is an advertisement gap, not a functional one. ALFQuote calls stats views defensively and never treats the missing advertisement as compatibility success ([docs/pins.md, Caveats](docs/pins.md#caveats)).
- **Why it matters:** an integrator relying on `supportsInterface(IHookStats)` to gate stats enrichment would silently disable it on these deployments.
- **Suggestion:** either advertise `IHookStats` from these hooks (if intentional) or note in `IALFHook` docs which interfaces are guaranteed ERC-165-advertised vs. must-be-attempted.

### 3. The deployed PoolManager `Initialize` event differs from current v4-core main

- **Observed:** the deployed mainnet PoolManager emits `Initialize(bytes32 id, address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)` (topic0 `0xdd466e67…`), while the current `v4-core` main-branch interface omits the trailing `sqrtPriceX96`/`tick` words (topic0 `0x3fd553db…`). We verified this against the demo pool's initialization log at block `25540385` and pinned the deployed signature ([docs/pins.md, discrepancy pin](docs/pins.md#deployed-initialize-signature-discrepancy-pin)).
- **Why it matters:** pool discovery that decodes `Initialize` with the current interface ABI will silently fail to decode mainnet logs (different topic0). Anyone rebuilding PoolKey from events needs the deployed signature.
- **Suggestion:** a note in the v4 docs/deployments page listing the deployed event signature per PoolManager deployment (or a deployed-ABIs reference) would save integrators real debugging time.

### 4. `hooklist` vs routing policy — two different questions

- **Documented:** `hooklist` is a public catalog of hooks; it is not the Uniswap Labs routing allowlist. Current routing guidance calls for manual review when a hook uses return-delta or dynamic-fee behavior, has an address starting with `0x91`, or targets a major pair such as ETH/USDC.
- **How we honored it:** ALFQuote reports routing as its own assessment dimension (`automatic | manual-review | unknown`) evaluated from those documented rules, never inferred from `hooklist`, and never collapsed into a single "safe" verdict with compatibility and provenance ([README contract map](README.md#contract-map)).
- **Suggestion:** the distinction is documented but subtle; a one-liner on `hooklist` itself ("listing ≠ routing approval") would prevent misreads.

### 5. `getIndicativeQuote` is honest about being non-binding — and it matters

- **Documented:** `IALFHook` documents the indicative quote as non-binding (single-step simulation; execution price comes from `beforeSwap`).
- **Observed (size study, block `25926196`, empty `hookData`, 50 bps):** at 1–10 USDC exact-in the simulated fill met a 50 bps bound on the quote; at 100 USDC the executable output was ~46% below the quote, so `amountOutMinimum` correctly reverted the swap (`V4TooLittleReceived`). Full table: [docs/pins.md, WO-6](docs/pins.md#quote-vs-fill-by-size-wo-6).
- **Why it matters:** agents and routers that forward the indicative quote as an executable expectation will break at size. The upstream doc is correct; the failure mode is integrators not reading it.
- **Suggestion:** consider an explicit "do not use as `amountOutMinimum`" note next to `getIndicativeQuote` in `IALFHook` — that is the exact mistake we saw ourselves tempted to make.

### 6. What worked well

- Documented, stable mainnet addresses for PoolManager/factory made bootstrap verification straightforward.
- The `AllowlistedFactory` design (registry + `isFromFactory` + `creationCodeHashOf`) gives clean two-way bytecode provenance — enough to attest *bytecode origin* without over-claiming operator trust, which is exactly the right shape for an integrator check.
- Empty `hookData` being the documented DualPool path kept the execution layer a completely standard v4 swap: UR v2 `V4_SWAP` with `SWAP_EXACT_IN_SINGLE`/`SETTLE_ALL`/`TAKE_ALL` encoded and executed without any hook-specific calldata.
- On a controlled Tenderly fork of mainnet, the protected 1 USDC swap completed with the full JIT cycle visible in the trace (vault withdrawals → three hook `ModifyLiquidity` events → `Swap` → burns → re-deposits), actual output ≥ `amountOutMinimum`, input/output reconciled against balance deltas and logs ([docs/fork-evidence.json](docs/fork-evidence.json), public explorer trace linked in [docs/pins.md](docs/pins.md#controlled-fork-execution-proof-wo-7--wo-8)). That trace is the clearest illustration of how DualPool actually executes that we found anywhere.

### Trading API

Not evaluated. We make no claim about Trading API behavior with DualPool pools because we did not produce a reproducible request/response pair during this build; the verified integration gap we report is limited to vanilla-liquidity reads (item 1).

## Reproduce

Latest-state (any mainnet RPC; values move with state):

```sh
git clone https://github.com/abhi152003/alfquote && cd alfquote
git checkout phase2-baseline
npm ci && npm run build
export ETHEREUM_RPC_URL="https://your-mainnet-rpc"
node packages/cli/dist/main.js discover --chain 1 --format json
node packages/cli/dist/main.js assess --hook 0x0000005bb4DF4109bF356a585C8b8Ea70FCbAaC0
node packages/cli/dist/main.js quote --use-fixture-pool --amount 1 --exact-in   # vanilla=0, effective>0
node packages/cli/dist/main.js swap --use-fixture-pool --amount 1 --slippage-bps 50 --sender <address> --dry-run
```

Pinned-block historical replay (archive RPC) and the full Phase 1 evidence chain (spike → negative-liquidity proof → size sweep → controlled-fork execution) are in [docs/pins.md](docs/pins.md), reproduced by `npm run spike | proof | sweep | fork`.

## Summary of asks

1. Call out the vanilla-liquidity-vs-JIT-capacity gap in v4 integration docs (item 1).
2. Clarify `IHookStats` ERC-165 advertisement expectations (item 2).
3. Publish deployed `Initialize` (and other) event signatures per PoolManager deployment (item 3).
4. Add "listing ≠ routing approval" guidance to `hooklist` (item 4).
5. Warn against using `getIndicativeQuote` as `amountOutMinimum` at the interface level (item 5).
