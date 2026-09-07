<!--lint disable strong-marker-->

# Review Log: WO-2

**Work Order:** WO-2 — Verify Ethereum DualPool deployments and pin the demo pool
**Initialized At (UTC):** 2026-09-06T18:22:44Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Reviewed by a dedicated review delegate subagent on 2026-09-07, against base commit `bacc500` on `main` (all WO-2 work uncommitted on top). Changed paths: 5 modified (README.md, scripts/verify-mainnet.ts, src/abi/README.md, src/index.ts, tsconfig.json), 8 new src modules, 6 new ABI JSON pins, 3 new test files, docs/pins.md, plus `.sw-factory/WO-2/*` for internal consistency.

### Requirements Alignment

**Blocking:**

(none)

**Advisory:**

1. docs/pins.md — a few claims (demo-pool tx sender, `sqrtPriceX96`/`tick`, `pools` mapping slot) were not re-emitted by `npm run spike` output, making per-claim reproduction only partially direct. **Fixed post-review:** the spike now prints a `pools mapping slot` info check and includes `sqrtPriceX96`/`tick` in the PoolKey evidence line (24 checks total).
2. scripts/verify-mainnet.ts — a hypothetical factory-bytecode absence records the fail but continues remaining checks instead of stopping immediately; still fails closed at the summary and exits 1. **Accepted as-is:** "record a blocking result and stop" is satisfied by the non-zero exit; continuing read-only checks yields more diagnostic evidence.

All 7 acceptance requirements verified against code, docs, and a live read-only spike run.

### Blueprint Alignment

**Blocking:**

(none)

**Advisory:**

(none)

Grep across src/scripts/test for `sendTransaction|signer|wallet|privateKey|mnemonic|eth_sign|account|simulate`: zero matches. All RPC usage is read-only (`readContract`/`getCode`/`getStorageAt`/`getContractEvents`). No liquidity/quote/routing/proxy/Universal-Router work. IHookStats is pinned for its interface id only (part of ERC-165 verification) and surfaced the WO-3 caveat. Discovery follows the blueprint path exactly.

### Architecture And Conventions

**Blocking:**

(none)

**Advisory:**

1. src/binarySearch.ts — `findEarliestTrue` took an unused `client` parameter. **Fixed post-review:** parameter removed; call sites updated.

Module separation, fail-closed posture (wrong-chain abort, binary-search boundary verification, reconstruction-miss → failed check, top-level redacting catch), and WO-1 reuse were assessed as clean.

### Tests And Build

**Commands run:**

- `npm run type-check` — exit 0
- `npm test` — 24/24 passed (4 files)
- `npm run spike` (reviewer-executed, read-only) — all checks passed at head 25920363, exit 0

**Blocking:**

(none)

**Advisory:**

(none)

### User-Facing Verification

**Skipped:** no — the streamed spike output is the user-visible surface; the reviewer ran it live.

**Evidence:**

Reviewer re-ran the spike and every stable value matched docs/pins.md exactly (birth blocks, all 5 registry entries with blocks/txs/deployers, selected hook, creationCodeHash, hook.factory() match, IHookStats=false on both hooks, demo-pool block/tx, derived PoolId equality). Reviewer also independently recomputed offline: IALFHook=0x7adbfbb8, IHookStats=0x601b90d3, deployed-Initialize topic0=0xdd466e67…, v4-core-main topic0=0x3fd553db…, and derivePoolId(USDC/USDT/10/10/fixture)=0xf32349cb…bdb065 — all equal the pins.md claims.

**Blocking:**

(none)

**Advisory:**

(none)

### Security, Privacy, And Data Safety

**Blocking:**

(none)

**Advisory:**

1. scripts/verify-mainnet.ts — `maskUrl`/`redact` covered only `/v2/<key>` paths (Alchemy); Infura-style `/v3/<key>` or query-string keys would print unmasked. **Fixed post-review:** both functions now redact `/v2/` and `/v3/` path segments.

`.env` gitignored and not tracked; `.env.example` only; output masking present; no private keys; ABI JSONs contain no bytecode.

### Round 1 Verdict

- Total blocking: 0
- Total advisory: 6 (4 fixed post-review within scope; 1 accepted with rationale; 1 artifact-consistency fix applied to context.md and implementation-plan.md)
- Files reviewed: 23 changed paths + 4 execution artifacts
- **Verdict:** APPROVED

---

<!-- Subsequent rounds: copy the structure above and increment the round number. -->

## Round 2

**User-directed cleanup, 2026-09-07.** After Round 1 approval, the user
decided that one-off verification code should not live in the codebase: the
facts it established are verified, so they are pinned as evidence instead.

Removed:

- `src/binarySearch.ts` (whole file)
- `findContractBirth`, `readDeployedLogs` + `DeployedLogRecord` from `src/discovery.ts`
- `poolsValueSlot`, `discoverPoolsMappingSlot`, `findPoolInitializationBlock`, `fetchInitializeLog`, `reconstructPoolKey` + `ReconstructedPool`/`PoolReconstruction` from `src/pool.ts`
- Per-deployment `Deployed`-event window fetching and the `pools` mapping-slot check from the spike

Added (evidence, not logic): pinned constants in `src/addresses.ts`
(`PINNED_POOL_KEY`, `DEMO_POOL_INIT`, birth blocks, `FACTORY_REGISTRY_SNAPSHOT`),
a `registry snapshot integrity` spike check (append-only registry must still
contain the pinned deployments), and a chain-truth unit test
(`derivePoolId(PINNED_POOL_KEY) === FIXTURE_POOL_ID`). `docs/pins.md` now
records the archive-binary-search approach as the verification method that was
followed, with the results pinned.

Kept (direct-read product path): bytecode checks, factory enumeration,
two-way provenance, ERC-165 checks, interface-id computation, PoolId
derivation, pinned-evidence printing.

Verification after cleanup: `npm run type-check` exit 0; `npm test` 25/25
passed; `npm run spike` all 16 checks passed at head 25923551, exit 0 — same
required-check outcomes as Round 1 with the search-dependent evidence rows
replaced by pinned constants.

- Total blocking: 0
- Total advisory: 0
- **Verdict:** APPROVED

---
