# Mainnet pins

Read-only evidence recorded by the ALFQuote verification spike. Every claim
below carries a block number or source revision and is reproduced by the
command in [Reproduction](#reproduction). Re-run the spike to refresh values;
mainnet state moves.

- **Recorded:** 2026-09-07 UTC (spike run at head block `25920319`)
- **Chain:** Ethereum mainnet (chain id asserted == 1 before any read)
- **Endpoint:** Alchemy mainnet HTTPS (`ETHEREUM_RPC_URL` in `.env`; key redacted, never committed)

## Upstream source pins

Exact upstream links and the StateLibrary excerpt are in [docs/upstream/](upstream/README.md).

| Pin | Value |
| --- | --- |
| `v4-hooks-public` revision | [`0f731d5de0f4fd60b506b55754d5e6ff086eab7d`](https://github.com/Uniswap/v4-hooks-public/tree/0f731d5de0f4fd60b506b55754d5e6ff086eab7d) (2026-08-19) |
| `IALFHook` | [`IALFHook.sol`](https://github.com/Uniswap/v4-hooks-public/blob/0f731d5de0f4fd60b506b55754d5e6ff086eab7d/src/alf/interfaces/IALFHook.sol) — ERC-165 id `0x7adbfbb8` |
| `IHookStats` | [`IHookStats.sol`](https://github.com/Uniswap/v4-hooks-public/blob/0f731d5de0f4fd60b506b55754d5e6ff086eab7d/src/alf/interfaces/IHookStats.sol) — ERC-165 id `0x601b90d3` |
| `v4-core` revision | [`46c6834698c48bc4a463a86d8420f4eb1d7f3b75`](https://github.com/Uniswap/v4-core/tree/46c6834698c48bc4a463a86d8420f4eb1d7f3b75) |
| `POOLS_SLOT` / `LIQUIDITY_OFFSET` | [`StateLibrary.sol`](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/StateLibrary.sol) `POOLS_SLOT = 6`, `LIQUIDITY_OFFSET = 3`; excerpt `docs/upstream/StateLibrary.excerpt.sol` |
| ABI files | `src/abi/*.json` (canonical pins) + `src/abis.ts` (typed runtime view); selector equivalence enforced by `test/abiEquivalence.test.ts` |

### Deployed `Initialize` signature (discrepancy pin)

The **deployed** mainnet PoolManager emits
`Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)`
(topic0 `0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438`).
The current `v4-core` main-branch interface file omits the trailing
`sqrtPriceX96`/`tick` data words (topic0 `0x3fd553db…`). PoolKey
reconstruction must use the **deployed** signature above. Verified against the
demo pool's initialization log at block `25540385`.

## Interface ids

Computed from the pinned ABIs (`src/interfaceId.ts`, XOR of own-function
selectors; method validated by the ERC-165 known-answer test against
`0x01ffc9a7`) and then queried on-chain through `supportsInterface`:

| Interface | Id | On-chain support |
| --- | --- | --- |
| IERC165 | `0x01ffc9a7` | `true` on factory hook #0 and on the fixture hook (block `25920319`) |
| IALFHook | `0x7adbfbb8` | `true` on factory hook #0 and on the fixture hook (block `25920319`) |
| IHookStats | `0x601b90d3` | **`false`** on both (block `25920319`) — see Caveats |

## Documented targets

| Contract | Address | First runtime code (block) | Runtime size |
| --- | --- | --- | --- |
| AllowlistedFactory | `0x0000000000077769C332e0D3ed8bC8E02A0cE108` | `25581749` | 1158 bytes |
| PoolManager (v4) | `0x000000000004444c5dc75cB358380D2e3dE08A90` | `21688329` | 24009 bytes |
| Fixture DualPool hook | `0x00000078BD49D5279a99b5F4011a5C61eE8caaC0` | `25525327` | — |

Birth blocks located on 2026-09-07 by archive `eth_getCode` binary search over
the block range `[20000000, head]` (predicate: runtime code present; ~25
archive reads each). The one-off search code was removed after verification —
the blocks are pinned constants in `src/addresses.ts`
(`POOL_MANAGER_BIRTH_BLOCK`, `FACTORY_BIRTH_BLOCK`,
`FIXTURE_HOOK_BIRTH_BLOCK`).

## Factory registry (block `25920319`)

`allDeploymentsLength() = 5`. Enumeration via `allDeployments(i)`; each
`Deployed` event located by pinpointing the hook's birth block, then a
bounded-window `eth_getLogs` (free-tier RPCs cap log ranges):

| # | Hook | Deployed at | Transaction | Deployer |
| --- | --- | --- | --- | --- |
| 0 | `0x0000005bb4DF4109bF356a585C8b8Ea70FCbAaC0` | `25589269` | `0xdf805db7ff3a258f6f4d85d4c2b95e49c24435b9b24c5ea8b8f975943fbeee71` | `0x58e28b95a2ee57c4E90613AFce9e8CCEED3aB1E8` |
| 1 | `0x55BA643a0716988F2a7E7ff27Dc4c80BEa8a6ac0` | `25589312` | `0x048243d5af73c94131ccbffb06f26cd7e0365c3097f0296ed6c34dc469e9b63bc` | `0x5B57d58970ebe25B98b22DB1E9f5BE61B362B4c6` |
| 2 | `0x7b919ca67cbd31Ce752761e88Eb674acBFd22ac0` | `25589702` | `0x2c6cd5e0669423d7e0f45b70e12a5b18f148ce090025209813a85d26e2b843c5` | `0x892A2A64178aF49Ec56d2311F955168cc96b8511` |
| 3 | `0xCDE44B16E25B4321EF6471A4aa8D9D4D4Fbf2AC0` | `25589952` | `0xb203e0d3259bb7440549677b7f55bbc0c97bbbf019ee8843bc608939555e24af` | `0xf520820897Fd7CA6977777892aed0e4B35a74D5F` |
| 4 | `0x000075e7511D6104d8b1e617A27d426d7611eac0` | `25901172` | `0x2533aeb4a265edf333ce8f64df70b188950498d6faea25210f538c33f38fec8b` | `0x61E75d5c5deE4205a5bBCD9fBc40498b693197ad` |

## Selected hook and provenance

- **Selected hook (factory-attested):** registry index 0,
  `0x0000005bb4DF4109bF356a585C8b8Ea70FCbAaC0` — first registry entry whose
  `supportsInterface(IALFHook)` returns `true`.
- Forward provenance: `factory.isFromFactory(hook) = true`,
  `creationCodeHashOf(hook) = 0xb63b7eeaa4c8c264312daacf539b12878b967d01c6be842a6e0c304b8f00affa`.
- Reverse provenance: `hook.factory() =
  0x0000000000077769C332e0D3ed8bC8E02A0cE108` — matches the documented
  factory.
- **Fixture hook:** `0x00000078BD49D5279a99b5F4011a5C61eE8caaC0` predates the
  factory (birth `25525327` < factory birth `25581749`). It is always labeled
  `provenance: fixture`, never factory-attested.
- Provenance attests bytecode origin **only**. It is not operator, vault,
  routing-policy, upgradeability, or liveness safety (see docs/ALFQuote.md).

## Demo pool pin

| Field | Value |
| --- | --- |
| PoolId (documented) | `0xf32349cbc41fec9d3194f2b4e9ee72ded0bfda412427be9cb8a4087f74bdb065` |
| currency0 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (USDC) |
| currency1 | `0xdAC17F958D2ee523a2206206994597C13D831ec7` (USDT) |
| fee | `10` |
| tickSpacing | `10` |
| hooks | `0x00000078BD49D5279a99b5F4011a5C61eE8caaC0` (fixture) |
| Initialized | block `25540385`, tx `0x6e4d659056af64eb5c5f3f045e1536cbb9f9955169f33369b13be8c724729d03`, `sqrtPriceX96 = 2^96` (price 1.0), `tick = 0` |
| Called by | `0x58e28b95a2ee57c4E90613AFce9e8CCEED3aB1E8` via the hook's `initializePool` |

Verification approach (followed once on 2026-09-07; the helper code was
removed afterwards and the results pinned): the initialization block was
located by binary search on the pool's `pools[poolId]` storage slot (`pools`
mapping at slot `6`, discovered empirically by scanning candidate mapping
slots for zero-before/nonzero-after; zero before block `25540385`, nonzero
after). The `Initialize` log was then read in a bounded window and decoded
with the deployed signature. `keccak256(abi.encode(poolKey))` computed
off-chain from the decoded key equals the documented pool id above — the
encoding is cross-validated against chain truth, and that equality is now
permanently guarded by `test/pool.test.ts` and re-checked by every spike run
against the pinned key in `src/addresses.ts` (`PINNED_POOL_KEY`).

## Negative-liquidity proof (WO-3)

Read-only comparison of three capacity signals plus an indicative quote, all
at **one** Ethereum block against the pinned fixture pool. Labels are fixed:

| Signal | Meaning | Units |
| --- | --- | --- |
| PoolManager vanilla liquidity | Persistent v4 liquidity active at the current tick | v4 liquidity (`L`) |
| DualPool `getReserves` | Total economic assets | token raw units |
| DualPool `getEffectiveLiquidity` | Currently usable assets | token raw units |

Reserves are **not** executable capacity.

- **Recorded:** 2026-09-07 UTC
- **Block:** `25923945` (every value below is from this block)
- **Hook:** fixture `0x00000078BD49D5279a99b5F4011a5C61eE8caaC0`
- **PoolId:** `0xf32349cbc41fec9d3194f2b4e9ee72ded0bfda412427be9cb8a4087f74bdb065`

### Token units (read live, never assumed)

| Token | Address | `symbol()` | `decimals()` |
| --- | --- | --- | --- |
| currency0 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | USDC | 6 |
| currency1 | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | USDT | 6 |

### Liveness and quote bound

| Call | Result |
| --- | --- |
| `isLive()` | `true` |
| `livePools(poolId)` | `true` |
| `maxGas()` | `800000` (applied as the `eth_call` gas cap) |

### Capacity signals (same block)

| # | Signal | Value |
| --- | --- | --- |
| 1 | PoolManager vanilla liquidity | `0` (`L` units). Slot0 is populated (live price); thesis: vanilla depth can be empty while DualPool still quotes. |
| 2 | DualPool `getReserves` | `837470631` USDC raw / `168801400` USDT raw (`837.470631` USDC / `168.8014` USDT) |
| 3 | DualPool `getEffectiveLiquidity` | `837470631` USDC raw / `168801400` USDT raw (same as reserves on this pool at this block) |

`IHookStats` is still not ERC-165-advertised (see Caveats). Both views succeeded when called defensively.

### Indicative quote

| Parameter | Value |
| --- | --- |
| Direction | `zeroForOne = true` (USDC → USDT) |
| `amountSpecified` | `-100000000` (exact input of 100 USDC) |
| `hookData` encoding accepted | empty bytes (`0x`); encoded `ALFHookData` was not required |
| Gas cap | `800000` |
| Output | `99996353` USDT raw (`99.996353` USDT) |

A zero quote would have been recorded as a skip, not success.

### Go/no-go

**PROCEED.** Vanilla liquidity is 0, effective liquidity is positive, the pool is live, and the indicative quote is positive. Reproduced by `npm run proof` (exit 0). Simulation remains WO-4.

## Universal Router dry-run (WO-4)

Encoded `execute` for one exact-input single-hop DualPool swap. No transaction or approval was sent.

| Pin | Value |
| --- | --- |
| Universal Router v2 | `0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Commands | `0x10` (`V4_SWAP`) |
| Actions | `0x060c0f` (`SWAP_EXACT_IN_SINGLE`, `SETTLE_ALL`, `TAKE_ALL`) |
| `hookData` | empty (`0x`) |
| Encoding | UR v2 `ExactInputSingleParams` (no `minHopPriceX36`) |
| Slippage | 50 bps (explicit; not the raw quote) |

### Quote vs simulation (block `25924660`)

| Field | Value |
| --- | --- |
| Sender (dry-run `msg.sender` only) | `0xF977814e90dA44bFA03b6295A0616a897441aceC` |
| Exact in | 100 USDC (`100000000` raw) |
| Indicative quote | `99996353` USDT raw |
| `amountOutMinimum` | `99496371` USDT raw (quote × 9950 / 10000) |
| ERC-20 → Permit2 | `0` (blocker, not bypassed) |
| Permit2 → UR | amount `0`, expiration `0` (blocker, not bypassed) |
| Simulation | revert `V4TooLittleReceived(99496371, 72792356)` |

The swap action ran and returned `72792356` USDT raw (~72.79 USDT). That is below a 50 bps bound on the indicative quote, so the min-out protection fired.

**Quote vs executable output:** at 100 USDC exact-in, indicative quote ≈ 99.996 USDT and simulated swap output ≈ 72.79 USDT (~27% worse). DualPool `getIndicativeQuote` is a single-step view, not a firm price. Judge-facing claims must not treat the quote as guaranteed fill. This limitation is unresolved at the tested size; it is not a reason to change the selected pool.

**DIAGNOSTIC-ONLY** follow-up at 3000 bps (min `69997447`): swap min-out passed; `execute` then reverted `AllowanceExpired(0)` on settle — correctable by Permit2 approval, which Phase 1 does not create. 3000 bps is **not** a recommended production setting.

No broadcast.

Phase 1 simulation gate uses Universal Router **v2 encoding only**. Alternate UR structs are not used to convert a min-output, allowance, balance, or transfer failure into success.

## Phase 1 re-run (WO-5)

Latest-state re-run after the evidence hardening. Historical birth blocks and the WO-3 proof at `25923945` remain the original pins.

| Command | Latest-state block | Result |
| --- | --- | --- |
| `npm run spike` | `25925047` | 16/16 required checks; IHookStats advertisement discrepancy recorded (`IALFHook=true`, `IHookStats=false`) |
| `npm run proof` | `25925049` (same-block reads) | PROCEED; empty `hookData`; vanilla `L=0`; slot0 populated |
| `npm run simulate` | quote `25925049`, simulate `25925049` (sequential latest-state, not a single shared block unless equal) | UR v2 only; `V4TooLittleReceived(99496371, 72792714)`; Permit2 blockers reported, not bypassed |

Exact bytes submitted to that simulation (must match `encoding` + `commands` + `inputs` + `deadline`):

| Field | Value |
| --- | --- |
| encoding | `v2` |
| commands | `0x10` |
| deadline | `1788779507` |
| sender | `0xF977814e90dA44bFA03b6295A0616a897441aceC` |

```
inputs=0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003060c0f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000078bd49d5279a99b5f4011a5c61ee8caac000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000005f5e1000000000000000000000000000000000000000000000000000000000005ee31b3000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000005f5e1000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000000000000000000000000000000000000005ee31b3
```

```
calldata=0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000006a9e9bf300000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003060c0f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000078bd49d5279a99b5f4011a5c61ee8caac000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000005f5e1000000000000000000000000000000000000000000000000000000000005ee31b3000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000005f5e1000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000000000000000000000000000000000000005ee31b3
```

WO-5 recorded a min-out revert at 100 USDC / 50 bps. That is **not** a successful `execute`. WO-6 re-ran sizes and records the Phase 1 decision below.

## Quote vs fill by size (WO-6)

Same pinned pool, empty `hookData`, UR v2, 50 bps, **block `25926196`**. Sender `0xF977814e90dA44bFA03b6295A0616a897441aceC` (USDC balance present; no Permit2). Commands: `npm run spike -- --block 25926196`, `npm run proof -- --block 25926196`, `npm run sweep -- --block 25926196`.

Proof at that block: vanilla `L=0`, slot0 populated, `isLive`/`livePools` true, `maxGas=800000`, reserves = effective = `853.335661` USDC / `152.97681` USDT, quote 100 USDC → `99993987` USDT raw, **PROCEED**.

| Exact in (USDC) | Indicative quote (USDT raw) | `amountOutMinimum` | Simulated fill (USDT raw) | Gap (bps vs quote) | `execute` result |
| --- | --- | --- | --- | --- | --- |
| 1 | `1000012` | `995011` | (swap min-out passed) | ≤ 50 | `AllowanceExpired(0)` |
| 5 | `5000048` | `4975047` | (swap min-out passed) | ≤ 50 | `AllowanceExpired(0)` |
| 10 | `10000060` | `9950059` | (swap min-out passed) | ≤ 50 | `AllowanceExpired(0)` |
| 100 | `99993987` | `99494017` | `53552079` | `4644` | `V4TooLittleReceived` |

Classification: the quote-versus-fill gap is **size-dependent**, not an encoding defect. At 1–10 USDC the swap action satisfies a 50 bps bound on the indicative quote. At 100 USDC the executable output is ~46% below the quote, so min-out fires. `IALFHook` documents that `getIndicativeQuote` is non-binding and that execution price comes from `beforeSwap`. This is an **upstream quote limitation at larger size**, not a reason to change the pinned pool. Extreme slippage is not used to manufacture a release success.

Full `execute` still reverts `AllowanceExpired(0)` at the small sizes because Phase 1 does not create ERC-20 or Permit2 approvals. That revert is correctable and is **not** treated as a successful protected simulation.

### Intended protected simulation (1 USDC, 50 bps, block `25926196`)

| Field | Value |
| --- | --- |
| encoding | `v2` |
| commands | `0x10` |
| actions | `0x060c0f` |
| `hookData` | empty (`0x`) |
| deadline | `1788793379` |
| sender | `0xF977814e90dA44bFA03b6295A0616a897441aceC` |
| amountIn | `1000000` |
| amountOutMinimum | `995011` |
| result | `AllowanceExpired(0)` (min-out passed; settle blocked) |

```
inputs=0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003060c0f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000078bd49d5279a99b5f4011a5c61ee8caac0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000f2ec3000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000040000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec700000000000000000000000000000000000000000000000000000000000f2ec3

calldata=0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000006a9ed22300000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003060c0f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000078bd49d5279a99b5f4011a5c61ee8caac0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000f2ec3000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000040000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec700000000000000000000000000000000000000000000000000000000000f2ec3
```

Replay of block `25926196` needs an archive-capable RPC. Latest-state runs omit `--block` / `ALFQUOTE_BLOCK`.

## Phase 1 decision

**REVISE.**

- Negative-liquidity proof: **PROCEED** (vanilla `L=0`, positive effective liquidity, positive empty-`hookData` quote).
- Protected Universal Router `execute` at 50 bps: **not successful**. Small sizes pass min-out then revert on missing Permit2; 100 USDC reverts `V4TooLittleReceived`.
- A Phase 1 PASS required one successful `execute` with a normal slippage bound. That did not occur. Phase 2 (library, CLI, `uniswap-ai`) must not start until a successful small-size simulation exists or the project is formally revised.
- Judge-facing claims: DualPool can quote while vanilla `L` is empty; the indicative quote is **not** a firm fill, especially at 100 USDC; execution remains standard v4 with empty `hookData`.

## Phase 1 release gate

`npm run release` runs type-check, build, tests, no-send, spike, proof, and `npm run simulate -- --amount 1`. It exits 0 **only** when that protected simulation succeeds. Diagnostic reverts (`npm run simulate:diagnostic`, `npm run sweep`) are separate and never determine the release result.

CI (`.github/workflows/phase1.yml`) runs install, type-check, build, tests, and the no-send grep. It does not use `ETHEREUM_RPC_URL`.

## Reproduction

Latest-state (any mainnet RPC; values move):

```sh
npm ci
npm run type-check && npm run build && npm test && npm run check-no-send
cp .env.example .env          # ETHEREUM_RPC_URL; ALFQUOTE_SIMULATION_FROM for simulate
npm run spike
npm run proof
npm run sweep
npm run simulate -- --amount 1
```

Historical replay of the WO-6 table (archive RPC required):

```sh
npm run spike -- --block 25926196
npm run proof -- --block 25926196
npm run sweep -- --block 25926196
npm run simulate -- --amount 1 --block 25926196
```

`npm run release` is the full local gate and will fail until `execute` succeeds.

Notes for reproduction on free-tier endpoints: `eth_getLogs` is capped at
small block ranges (Alchemy free: 10 blocks; public nodes: 10k or
recent-only), which is why the one-time verification located event blocks via
archive state binary search first. The cleaned spike only performs direct
reads (`eth_call`, `eth_getCode`) plus pinned constants, so **latest-state**
runs on any mainnet endpoint without archive access. Pinned-block replay needs
archive `eth_call` / `eth_getCode`.

## Caveats

- `IHookStats` (`0x601b90d3`) is **not** advertised by either the
  factory-attested hook or the fixture hook, even though both advertise
  `IALFHook` (`0x7adbfbb8`). That is a **discrepancy**, not compatibility
  success. Stats views are called directly. ERC-165 is not used as a substitute.
- Phase 1 quotes and swaps use **empty DualPool `hookData` only**. Encoded
  `ALFHookData` is diagnostic-only and cannot pass the quote gate.
- Registry membership and liveness change; re-run the spike before relying on
  any value here.

**Phase 1 decision: REVISE.**
