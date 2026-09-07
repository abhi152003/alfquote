<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-2

**Work Order:** WO-2 — Verify Ethereum DualPool deployments and pin the demo pool
**Created At (UTC):** 2026-09-06T18:22:44Z

## Summary

Implement the first read-only mainnet verification stage of the spike: confirm RPC/chain identity and bytecode at the documented AllowlistedFactory and PoolManager addresses, enumerate factory deployments and `Deployed` events, check two-way provenance (`isFromFactory` / `hook.factory()`), pin the current `IALFHook` ABI + interface IDs to the recorded upstream revision, verify ERC-165 compatibility on the selected hook, and reconstruct + verify the demo pool's exact PoolKey/PoolId. All evidence lands in `docs/pins.md` with block numbers, source revisions, and reproduction commands. Read-only throughout: `eth_call`/`eth_getCode`/`eth_getLogs` only, no state-changing transactions.

## Pinned upstream facts (gathered during context)

- Upstream revision: `Uniswap/v4-hooks-public@0f731d5de0f4fd60b506b55754d5e6ff086eab7d` (2026-08-19).
- `IALFHook` own functions: `getIndicativeQuote(PoolKey,bool,int256,bytes)`, `isLive()`, `maxGas()`, `swapToPrice(PoolKey,bool,int256,uint160,bytes)`. Inherits `IHookStats` (`getReserves(PoolKey)`, `getEffectiveLiquidity(PoolKey)`) and `IERC165`.
- Newer `ALFHookData` hookData convention in the pinned source: callers may pass ABI-encoded `ALFHookData` or **empty bytes** (interface doc allows both). Plan's "empty hookData for DualPool" remains valid; convention recorded in pins.
- `DualPoolHook`: `address public immutable factory` (getter `factory()`); `OwnedALFHook`: `livePools(PoolId)` → bool (pinned for WO-3 use).
- `IAllowlistedFactory`: `Deployed(address indexed deployed, bytes32 indexed creationCodeHash, address indexed deployer, bytes constructorArgs, bytes32 salt)`, `allDeployments(uint256)`, `allDeploymentsLength()`, `isFromFactory(address)`, `creationCodeHashOf(address)`.
- PoolKey tuple `(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)`; `PoolId = keccak256(abi.encode(key))` (v4-core `PoolId.toId`). PoolManager `Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks)`.
- Documented addresses (from plan doc, to reverify on-chain): factory `0x0000000000077769C332e0D3ed8bC8E02A0cE108`, PoolManager `0x000000000004444c5dc75cB358380D2e3dE08A90`, fixture hook `0x00000078BD49D5279a99b5F4011a5C61eE8caaC0`, fixture poolId `0xf32349cb...bdb065`.
- Public RPC `https://ethereum-rpc.publicnode.com` returns chainId 0x1 from this machine; used for probing only. Execution ran against the user-supplied Alchemy mainnet endpoint in `.env` (gitignored). Free-tier RPCs cap `eth_getLogs` ranges (Alchemy free: 10 blocks; drpc: 10k; publicnode: recent-only), so all log lookups locate event blocks first via archive-state binary search (`eth_getCode` / `eth_getStorageAt`) and then issue bounded-window queries (`src/binarySearch.ts`, `findContractBirth`, `discoverPoolsMappingSlot` / `findPoolInitializationBlock`).
- **Deployed-signature discovery (landed during implementation):** mainnet PoolManager emits `Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)` (topic0 `0xdd466e67…`), which differs from the current v4-core main-branch event that omits the trailing `sqrtPriceX96`/`tick` words. `src/abi/IPoolManager.json` pins the **deployed** signature; verified against the demo pool's initialization log at block 25540385.

## Code Reuse And Package Structure

Reused directly: `src/config.ts` (env contract — unchanged), `package.json` script set (`npm run spike` stays the entry), `.gitignore` (`.env` ignored), viem (HTTP public client, `toFunctionSelector`, `keccak256`, `encodeAbiParameters`, `decodeEventLog`), Vitest harness from WO-1.

New files:

| Path | Purpose |
| --- | --- |
| `src/addresses.ts` | Documented factory/PoolManager addresses, fixture hook + poolId constants |
| `src/abi/IERC165.json`, `src/abi/IHookStats.json`, `src/abi/IALFHook.json` | Hand-derived from the pinned interface sources (read-only views) |
| `src/abi/IAllowlistedFactory.json` | Factory ABI (events + views) from pinned source |
| `src/abi/DualPoolHookViews.json` | `factory()`, `livePools(bytes32)` getters from pinned hook sources |
| `src/abi/IPoolManager.json` | Minimal: `Initialize` event for PoolKey reconstruction |
| `src/interfaceId.ts` | ERC-165 interface-ID computation: XOR fold over `toFunctionSelector` |
| `src/client.ts` | `createMainnetClient(config)`: viem HTTP public client; fails unless `chainId === 1` |
| `src/discovery.ts` | Factory reads: bytecode check, `allDeploymentsLength` enumeration, bounded-window `Deployed` logs, `isFromFactory`, `creationCodeHashOf`, `findContractBirth` archive search |
| `src/hookChecks.ts` | Hook-side reads: `factory()` reverse provenance, ERC-165 `supportsInterface` for IALFHook/IHookStats/IERC165 IDs |
| `src/binarySearch.ts` | Monotonic-predicate block search with boundary verification |
| `src/pool.ts` | PoolKey reconstruction: empirical `pools` mapping-slot discovery, initialization-block binary search, bounded-window `Initialize` fetch; off-chain PoolId derivation + equality check |
| `scripts/verify-mainnet.ts` | Extended: after env validation, runs the WO-2 stage sequence with a check-reporter (name, pass/fail, evidence incl. block numbers); exits non-zero on any failed required check |
| `test/interfaceId.test.ts` | Interface-ID computation validated against the known IERC-165 constant `0x01ffc9a7`; ABI completeness assertions |
| `test/pool.test.ts` | PoolId derivation determinism + tuple encoding checks against a synthetic PoolKey |
| `docs/pins.md` | The evidence record this WO requires |

Modified: `README.md` (mention `docs/pins.md`), `tsconfig.json` (`resolveJsonModule`). `.env` is user-managed (user instruction: do not touch) holding the Alchemy mainnet endpoint; gitignored.

## Components And Flow

```text
scripts/verify-mainnet.ts
  -> loadSpikeConfig (WO-1, unchanged)
  -> createMainnetClient  (src/client.ts; abort if chainId != 1)
  -> discovery.verifyFactoryBytecode        (eth_getCode, blockNumber recorded)
  -> discovery.enumerateDeployments         (allDeploymentsLength + allDeployments(i))
  -> discovery.readDeployedLogs             (eth_getLogs, address=factory, topic0=Deployed)
  -> hookChecks.reverseProvenance(hook)     (hook.factory() vs factory address)
  -> discovery.factoryProvenance(hook)      (isFromFactory(hook), creationCodeHashOf(hook))
  -> hookChecks.erc165(hook, ids)           (supportsInterface x3)
  -> pool.reconstructPoolKey(poolManager, poolId)  (Initialize log by topic1=poolId)
  -> pool.derivePoolId(key)                 (keccak256(abi.encode(tuple))) === poolId ?
  -> reporter summary; any required failure => exit 1
```

Each check returns `{ name, status: 'pass'|'fail'|'info', evidence: string }`; the script prints them and `docs/pins.md` records the same facts in durable form with reproduction commands. The fixture hook is always labeled `fixture` (never factory-attested) per the plan; factory enumeration results are reported separately from the fixture decision.

## Steps

1. **ABI pins** — write the six ABI JSON files + `src/addresses.ts` from the pinned source facts above.
2. **Pure helpers + tests** — `src/interfaceId.ts`, `src/pool.ts` derivation, `test/interfaceId.test.ts`, `test/pool.test.ts` (IERC-165 known-answer test validates the XOR method).
3. **Client + discovery + hook checks** — `src/client.ts`, `src/discovery.ts`, `src/hookChecks.ts`.
4. **Orchestration** — extend `scripts/verify-mainnet.ts` with the staged reporter.
5. **Run against mainnet** — create `.env` (public RPC), `npm run spike`, capture results; fix ABI/signature drift surfaced by on-chain failures.
6. **Evidence** — write `docs/pins.md` (addresses, revision, block numbers, raw identifiers, repro commands); update README pointer.
7. **Verification pass** — type-check, tests, spike green; review phase.

Steps 1–2 are parallelizable against nothing; 3 depends on 1; 4 depends on 3; 5 depends on 4.

## Testing

Automated (`npm test`):

- `test/interfaceId.test.ts`: XOR-fold reproduces the standard IERC-165 id `0x01ffc9a7` from `supportsInterface(bytes32)` (known-answer test); computed IALFHook/IHookStats ids are stable 4-byte constants; every pinned ABI JSON exposes its required function names.
- `test/pool.test.ts`: `derivePoolId` over a synthetic PoolKey is deterministic, 32 bytes, and matches an independently precomputed keccak (recorded expected value in the test).

Static: `npm run type-check`.

Manual / exploratory (the WO's acceptance surface, run with `.env`):

- `npm run spike` executes the full stage list; every required check prints `pass` with block-number evidence; exit 0.
- Failure injection: wrong chain (a non-mainnet RPC) → clear abort before any read; garbage `poolId` constant → PoolKey reconstruction reports the miss clearly instead of crashing.
- `docs/pins.md` claims spot-checkable: each recorded read includes block number + the exact `npm run spike` stage that reproduces it; upstream revision recorded for every ABI.

Out of scope: liquidity/quote proofs (WO-3), simulation (WO-4), routing/upgradeability classification, any state-changing call.
