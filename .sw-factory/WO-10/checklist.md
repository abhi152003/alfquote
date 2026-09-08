<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-10

**Work Order Number:** WO-10
**Work Order Title:** Implement reusable hook and pool discovery
**Initialized At (UTC):** 2026-09-08T19:44:46Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output
- [x] Identify linked requirements and blueprints
- [SKIP] Review every connected requirements document
  Skip reason: no requirements documents are linked to WO-10 (project has only unattached OVERVIEW docs).
- [x] Review every connected blueprint document
  Both linked blueprints were read in full during WO-9 and remain in context (Phase 2 plan 40e5f328; product blueprint 5ece3519 — discovery rules, two-way provenance, fixture labeling, pool identity).
- [SKIP] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
  Skip reason: the two linked documents reference only each other and KB docs already read (concepts f0e3e0ca, internals 5651dfe0).
- [SKIP] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
  Skip reason: same as above; context.md records them.
- [x] Extract acceptance criteria from requirements
  WO-10 Requirements mapped to service behavior in implementation-plan.md.
- [x] Identify architecture path from blueprints (components, contracts, composition)
  Envelope-returning discovery service inside `packages/alfquote/src/discovery.ts`, consuming WO-9 contracts.
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md`
- [x] Testing section documented in `implementation-plan.md`

### Implementation

- [x] Implemented changes are scoped to the Work Order
  `discovery.ts` service additions + `poolManagerInitializeEvent` export + `errorMessage` sanitizer in `result.ts` (a live-verified security fix: viem transport errors embed full RPC URLs with credentials; every catch site now sanitizes). Surface tests re-owned: discovery split into `surface/discovery.test.ts`; `domains.test.ts` split into per-owner assessment/quote/swap files so WO-11/12/13 own theirs exclusively. No assessment/quote/swap logic, no CLI, no multi-chain, no indexing.
- [x] Tests added or updated for changed behavior
  `discoveryService.test.ts`: 16 scenarios — chain mismatch, factory bytecode, registry RPC failure, pinned two-way factory labeling, one-sided downgrade, per-hook throw isolation, fixture labeling without factory calls, missing-code fixture, empty registry, PoolKey reconstruction + PoolId verification, malformed/foreign-event log handling, getLogs failure, no-pool outcome.
- [x] Documentation, generated files, fixtures, migrations, or config updated where relevant
  None required beyond the plan; `.env` untouched.

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [x] Review subagent spawned per `execution/review-phase.md` and returned a verdict
- [x] All acceptance criteria from the Work Order and linked requirements are satisfied
  Live read-only verification (mainnet, via built package): discoverFactoryHooks at pinned 25930000 returned all 5 registry hooks provenance=factory with full two-way evidence and the fixture hook labeled fixture with null evidence, zero partial failures; discoverHookPools around the pinned init block returned exactly the demo pool with poolKeyMatches=true and the recorded init tx hash. Canonical serializer round-tripped both envelopes.
- [x] Architecture is aligned with linked blueprints, or documented drift is accepted
- [x] Exploratory pass on user-visible or external behavior — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
  Live mainnet runs above (one-off script, not committed, deleted after use).
- [x] Latest `review-log.md` verdict is `APPROVED`

- [x] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [x] All phase certifications above are complete
- [x] Checklist is fully filled out with evidence
- [x] Review log is complete (`review-log.md`)
- [x] Implementation plan was followed (`implementation-plan.md`)
- [x] All intended files are present in the working tree
- [x] Work order status updated to `in_review`
