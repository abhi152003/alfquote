<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-2

**Work Order Number:** WO-2
**Work Order Title:** Verify Ethereum DualPool deployments and pin the demo pool
**Initialized At (UTC):** 2026-09-06T18:22:44Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output
  Read via `read_work_order` (WO-2, id d82ecce9-1bb8-4487-8a39-8413ae0ad540). Read-only mainnet verification + ABI/pool pinning into `docs/pins.md`; no liquidity/quote/simulation work.
- [x] Identify linked requirements and blueprints
  Three linked blueprints, no requirements documents linked (consistent with WO-1).
- [SKIP] Review every connected requirements document
  Skip reason: WO-2 links no requirements documents; acceptance criteria are in the Work Order description.
- [x] Review every connected blueprint document
  All three read in full via MCP. "Uniswap Internals for Building ALFQuote" was partially read during WO-1; the remaining sections (v4 core/periphery, ALF, DualPool, end-to-end flow) were read now, completing the document.
- [x] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
  Reference graph closed during WO-1: the three linked blueprints reference only each other (all read).
- [x] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
  No new referenced blueprints beyond the three linked ones.
- [x] Extract acceptance criteria from requirements
  From WO description: factory bytecode present (or record blocking result and stop); deployment enumeration + events queried on mainnet; selected hook labeled factory-attested or fixture; provenance never treated as operator/vault/routing/liveness safety; IALFHook ABI + interface ID tied to recorded upstream revision; PoolKey includes currencies/fee/tickSpacing/hook; every pins.md claim has block number or source revision + reproduction command.
- [x] Identify architecture path from blueprints (components, contracts, composition)
  Discovery via `allDeployments`/`Deployed`/`isFromFactory`/`hook.factory()`; ERC-165 before trusting the interface; PoolKey reconstruction from PoolManager `Initialize` events; fixture labeled separately. Additionally pinned concrete upstream facts during context: v4-hooks-public revision `0f731d5d` (IALFHook/IHookStats/IAllowlistedFactory/DualPoolHook sources fetched and read), `livePools(PoolId)` on OwnedALFHook, `factory()` immutable getter on DualPoolHook, ALFHookData hookData convention (empty bytes allowed), and public-RPC connectivity confirmed (chainId 0x1).
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links
  Ran with all three linked blueprints and status in_progress.

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md`
- [x] Testing section documented in `implementation-plan.md`

### Implementation

- [x] Implemented changes are scoped to the Work Order
  Read-only verification only: viem HTTP reads (`eth_call`, `eth_getCode`, `eth_getStorageAt`, bounded `eth_getLogs`). No liquidity/quote proofs, no routing/proxy classification, no calldata/simulation, no state-changing tx, no mocks. Files: `src/addresses.ts`, `src/abis.ts`, `src/interfaceId.ts`, `src/client.ts`, `src/discovery.ts`, `src/hookChecks.ts`, `src/pool.ts`, `src/binarySearch.ts`, 6 ABI JSONs, extended `scripts/verify-mainnet.ts`, 3 test files, `docs/pins.md`, README pointer.
- [x] Tests added or updated for changed behavior
  24 tests total: WO-1 env contract (6) + interface-id known-answer vs `0x01ffc9a7` + ABI surface completeness (interfaceId.test.ts) + PoolId derivation vector/determinism/identity-sensitivity + address checksums (pool.test.ts) + JSON-pin vs typed-ABI selector equivalence (abiEquivalence.test.ts — caught a real nested-tuple bug during development).
- [x] Documentation, generated files, fixtures, migrations, or config updated where relevant
  `docs/pins.md` records every claim with block number or source revision plus reproduction commands; `src/abi/README.md` maps each ABI file to its pinned upstream source; README links pins.md. `.env` is user-managed (per user instruction) and gitignored.

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [x] Review subagent spawned per `execution/review-phase.md` and returned a verdict
  Dedicated delegate reviewed all 23 changed paths + execution artifacts against base `bacc500`; returned `VERDICT: APPROVED` (0 blocking, 6 advisory). Delegate independently re-ran the spike (all checks pass at head 25920363) and recomputed interface ids, event topics, and the PoolId offline — all matched pins.md.
- [x] All acceptance criteria from the Work Order and linked requirements are satisfied
  All 7 WO requirements verified (see review-log Round 1 Requirements Alignment). Final spike run: 24/24 checks pass at head 25920381.
- [x] Architecture is aligned with linked blueprints, or documented drift is accepted
  Read-only discovery path per blueprint; one documented drift: the deployed mainnet `Initialize` signature includes trailing `sqrtPriceX96`/`tick` (differs from v4-core main branch) — pinned to the deployed form and recorded in pins.md. Archive binary-search technique documented in plan + pins (RPC free-tier log-range caps).
- [x] Exploratory pass on user-visible or external behavior — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
  Not a browser app; the streamed spike output is the surface. The reviewer executed the spike live against mainnet and matched every stable pins.md value; evidence in `review-log.md` Round 1.
- [x] Latest `review-log.md` verdict is `APPROVED`
  Round 1: APPROVED. Advisory dispositions: 4 fixed post-review (mapping-slot + sqrtPrice/tick in spike output; `/v3/` key redaction; unused `client` param; context.md/plan placeholder-and-stale-text consistency), 1 accepted with rationale (fail-closed-at-summary on factory-bytecode absence).

- [x] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [x] All phase certifications above are complete
- [x] Checklist is fully filled out with evidence
- [x] Review log is complete (`review-log.md`)
- [x] Implementation plan was followed (`implementation-plan.md`)
  Followed as written, with two implementation-time discoveries recorded in the plan itself: the archive binary-search log technique (forced by free-tier RPC `eth_getLogs` caps) and the deployed-mainnet `Initialize` signature pin. Post-review advisory fixes applied and re-verified (type-check, 24/24 tests, 24/24 spike checks). Round 2 (user-directed): the one-off search code was removed and its verified results pinned as constants — see `review-log.md` Round 2; final verification 25/25 tests, 16/16 spike checks.
- [x] All intended files are present in the working tree
  `git status` vs base `bacc500`: 5 modified + 18 new paths + `.sw-factory/WO-2/`, matching the plan's file table plus execution artifacts. Nothing committed yet — version-control handoff awaits user direction.
- [x] Work order status updated to `in_review`
