# Implementation Plan: WO-10

**Work Order:** WO-10 — Implement reusable hook and pool discovery
**Created At (UTC):** 2026-09-08T19:44:46Z

## Summary

Extend the WO-9-owned `discovery.ts` module into the envelope-returning discovery
service: `discoverFactoryHooks` (live registry enumeration + two-way provenance +
explicit fixtures) and `discoverHookPools` (PoolManager `Initialize` log scan with
exact PoolKey/PoolId reconstruction). Partial failures become structured per-target
records; empty registries and no-pool scans are valid typed outcomes. Chain 1 is
enforced per call. Everything lands in the public library API only.

Blueprints: Phase 2 plan (KB 40e5f328 — reusable discovery boundary, typed results)
and product blueprint (KB 5ece3519 — factory discovery rules, two-way provenance,
fixture labeling, pool identity).

## Code Reuse And Package Structure

Reuse directly (already public, unchanged):

- `enumerateDeployments` / `factoryProvenance` (forward: `isFromFactory` +
  `creationCodeHashOf`) — `src/discovery.ts`
- `reverseProvenance` (reverse: hook `factory()`) — `src/hookChecks.ts`
- `hasBytecode` — factory sanity check
- `derivePoolId`, `PoolKey`, `PoolId` — `src/pool.ts`
- `ALLOWLISTED_FACTORY`, `POOL_MANAGER`, `IALFHOOK_INTERFACE_ID` — `src/addresses.ts`
- `okResult`/`errorResult`, `ChainBlockContext`, `CommandResult`, `COMMON_ERROR_CODES`
  (`rpc/chain-mismatch`) — WO-9 contracts
- `ProvenanceStatus` type — `src/assessment.ts` (type-only dependency; no cycle:
  assessment imports nothing from discovery)

New in `src/discovery.ts` (WO-10 owns this module):

- `DISCOVER_ERROR_CODES` / `DISCOVER_WARNING_CODES` registries (`discover/*`)
- `DiscoverHooksInput`, `DiscoverPoolsInput` input summaries
- `HookProvenanceEvidence`, `DiscoveredHook`, `TargetFailure`, `DiscoveredPool`,
  `FactoryHooksData`, `HookPoolsData` records
- `discoverFactoryHooks(client, { factory?, fixtures?, blockNumber? })`
- `discoverHookPools(client, { hook, fromBlock, toBlock? })`

`abis.ts` gains one exported `AbiEvent` (`poolManagerInitializeEvent`) for typed log
decoding. Pool scan uses raw `getLogs` + per-log `decodeEventLog` in try/catch so a
malformed log is a per-target failure, not a crash.

Tests: new `packages/alfquote/test/discoveryService.test.ts` (mock client, no
state-changing RPC). Surface tests are re-owned while the tree is unshared: discovery
assertions move out of `test/surface/domains.test.ts` into a new
`test/surface/discovery.test.ts`, and `domains.test.ts` is split into
`assessment.test.ts` / `quote.test.ts` / `swap.test.ts` so WO-11/12/13 each own a file
exclusively.

Modified: nothing else. `alfquote/phase1` untouched (compatibility adapter only).

## Components And Flow

```text
discoverFactoryHooks:
  assert chain 1 (error: rpc/chain-mismatch)
  hasBytecode(factory)  ─▶ error discover/factory-read-failed when absent
  enumerateDeployments  ─▶ error discover/registry-read-failed when the read throws
  per registry hook (parallel): factoryProvenance + reverseProvenance
      ─▶ success: provenance "factory" iff forward && reverse, else "unknown"
      ─▶ throw:   TargetFailure(discover/hook-provenance-failed), provenance "unknown", null evidence
  fixtures appended with provenance "fixture", no factory calls, registryIndex null
  ok(FactoryHooksData{hooks, partialFailures}) + warning discover/partial-failures when any

discoverHookPools:
  assert chain 1
  getLogs(address=POOL_MANAGER, fromBlock, toBlock ?? latest)
      ─▶ throw: error discover/pool-scan-failed
  per log: decodeEventLog(Initialize) in try/catch
      ─▶ malformed: TargetFailure(discover/log-decode-failed)
      ─▶ hooks !== target: skip
      ─▶ build PoolKey from topics+data; derivedPoolId = derivePoolId(key)
         poolKeyMatches = derivedPoolId === event id (topic 1)
  ok(HookPoolsData{pools, partialFailures}); empty pools is a valid outcome
```

Envelope: `chain = { chainId: 1, blockNumber: blockNumber ?? null, blockSource:
pinned|latest }`; every hook record carries the block used (null = latest-state);
every pool record carries its concrete init block and tx hash.

## Steps

1. Plan (this file) + context update; WO-10 → in_progress.
2. Implement `discovery.ts` additions + `poolManagerInitializeEvent` in `abis.ts`.
3. Split surface tests (`discovery.test.ts`; `domains.test.ts` → three per-owner
   files) and pin the new discovery surface.
4. `discoveryService.test.ts`: fixture labeling, block pinning, empty registry,
   two-way provenance (match/mismatch/throw), pool scan (match/derive-check/foreign
   hook), malformed log, RPC failures, chain mismatch.
5. Full offline matrix + gates; live read-only verification of both services against
   mainnet via the built library (one-off tsx eval, not committed).
6. Review delegate round; `.sw-factory/WO-10/` artifacts; WO-10 → in_review; commit.

## Testing

- `npm run type-check`, `npm run build`, `npm test` (124 existing + new discovery
  tests), `bash scripts/check-no-send.sh`, `bash scripts/check-package-boundaries.sh`.
- Live read-only: run `discoverFactoryHooks` and `discoverHookPools` (fixture hook,
  bounded range around the pinned init block from `alfquote/phase1`) against mainnet
  through the built package; record outputs in the checklist. No state-changing RPC
  (`getLogs`, `eth_call`, `eth_getCode` only).
- Boundary invariants hold: no env/argv/console/exit, no signers, no broadcasts, no
  controlled-fork references in `packages/alfquote/src`.
