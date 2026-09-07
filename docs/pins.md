# Mainnet pins

Read-only evidence recorded by the ALFQuote verification spike. Every claim
below carries a block number or source revision and is reproduced by the
command in [Reproduction](#reproduction). Re-run the spike to refresh values;
mainnet state moves.

- **Recorded:** 2026-09-07 UTC (spike run at head block `25920319`)
- **Chain:** Ethereum mainnet (chain id asserted == 1 before any read)
- **Endpoint:** Alchemy mainnet HTTPS (`ETHEREUM_RPC_URL` in `.env`; key redacted, never committed)

## Upstream source pins

| Pin | Value |
| --- | --- |
| `v4-hooks-public` revision | [`0f731d5de0f4fd60b506b55754d5e6ff086eab7d`](https://github.com/Uniswap/v4-hooks-public/tree/0f731d5de0f4fd60b506b55754d5e6ff086eab7d) (2026-08-19) |
| Interfaces pinned | `src/alf/interfaces/IALFHook.sol`, `src/alf/interfaces/IHookStats.sol`, `src/interfaces/IAllowlistedFactory.sol`, `src/alf/DualPoolHook.sol` (`factory()`), `src/alf/base/OwnedALFHook.sol` (`livePools(PoolId)`) |
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

## Reproduction

```sh
npm install
cp .env.example .env          # set ETHEREUM_RPC_URL to any Ethereum mainnet endpoint
npm run spike                 # WO-2: factory, provenance, PoolKey pins
npm run proof                 # WO-3: negative-liquidity proof; exit 0 = PROCEED
npm test                      # unit tests incl. ABI selector equivalence + interface ids
```

Notes for reproduction on free-tier endpoints: `eth_getLogs` is capped at
small block ranges (Alchemy free: 10 blocks; public nodes: 10k or
recent-only), which is why the one-time verification located event blocks via
archive state binary search first. The cleaned spike only performs direct
reads (`eth_call`, `eth_getCode`) plus pinned constants, so it runs on any
mainnet endpoint without archive access.

## Caveats

- `IHookStats` (`0x601b90d3`) is **not** advertised by either the
  factory-attested hook or the fixture hook at block `25920319`, even though
  both advertise `IALFHook` (`0x7adbfbb8`). The pinned upstream `IALFHook`
  inherits `IHookStats`, so the deployed hooks predate or diverge from that
  revision. Consequence for WO-3: `getReserves`/`getEffectiveLiquidity` calls
  must be attempted defensively (call and decode, do not trust
  `supportsInterface` alone), and failure must be reported, not guessed around.
- The `ALFHookData` struct convention (`hookData = abi.encode(ALFHookData(""))`
  or empty bytes) comes from the pinned interface source; the deployed hooks
  accepted an empty-`hookData` world before that revision. WO-3/WO-4 must test
  both encodings against the live hooks.
- Registry membership and liveness change; re-run the spike before relying on
  any value here.
