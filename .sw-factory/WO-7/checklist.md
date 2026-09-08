<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-7

**Work Order Number:** WO-7
**Work Order Title:** Prove protected DualPool execution on a Tenderly mainnet fork
**Initialized At (UTC):** 2026-09-07T19:06:59Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output
- [x] Identify linked requirements and blueprints
  No FRDs; three KB blueprints (read via `read_resource` — the blueprints module is
  empty; the linked documents live in the Knowledge Base).
- [SKIP] Review every connected requirements document
  Skip reason: no requirements documents linked; acceptance criteria are in the WO description.
- [x] Review every connected blueprint document
  Tenderly Fork Execution Plan, ALFQuote wrap, Judge Narrative; plus referenced
  Uniswap Internals (read during WO-1–6; re-checked).
- [x] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
- [x] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
- [x] Extract acceptance criteria from requirements
  In WO description: fail-closed Tenderly config + redaction; fork-origin/chain/bytecode/PoolKey/PoolId
  verification vs recorded block; dedicated test address; funding + approvals as separate recorded
  normal transactions (storage override = disclosed fallback only); 1 USDC UR v2 V4_SWAP swap at 50 bps;
  PASS = success + actualOut ≥ amountOutMinimum; trace shows UR → PoolManager → hook callbacks →
  settlement → transfers; evidence file + public link/exported trace; README/.env.example/pins.md
  labeling; mainnet no-send boundary kept and admin methods unreachable from mainnet path; CI
  unchanged (no secrets); final Phase 1 decision from combined evidence; WO-6/WO-7 reconciliation.
- [x] Identify architecture path from blueprints (components, contracts, composition)
  Separate Tenderly adapter (`src/tenderly/`): config (explicit mode, fail-closed, redacted),
  admin RPC (funding cheatcodes + unsigned eth_sendTransaction), fork verification vs mainnet
  archive, setup (fund/approve) recorded separately from the swap; reuse the pinned UR v2 encoder
  and empty-`hookData` quote path. Mainnet scripts stay read-only.
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md`
- [x] Testing section documented in `implementation-plan.md`

### Implementation

- [x] Implemented changes are scoped to the Work Order
  New `src/tenderly/` subtree (config, admin adapter, fork verification, setup, swap, evidence),
  `scripts/fork-execute.ts`, `npm run fork`/`fork:diagnostic`, re-scoped `check-no-send.sh`
  (adds the Tenderly boundary), `release.sh` gate swap, `.env.example`, README. Mainnet modules
  untouched except `loadRunOptions` default-amount parameter.
- [x] Tests added or updated for changed behavior
  86 tests (was 58): tenderlyConfig (fail-closed + redaction), tenderlyIsolation (boundary walk,
  admin probe fail-closed, cheatcode params), forkVerify (origin/fingerprint/chain-id),
  forkSetup (funding vs approval records, skips, revert fail-closed, override disclosure),
  forkSwapEvidence (PASS/FAIL rules, log decoding, evidence separation, secret assertions).
- [x] Documentation, generated files, fixtures, migrations, or config updated where relevant
  README (fork commands + evidence labels), .env.example Tenderly block, release.sh; pins.md
  WO-7 section lands with the live run.

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [x] Review subagent spawned per `execution/review-phase.md` and returned a verdict
  Round 1 CHANGES_REQUESTED (blocking: unparseable-URL error leaked the raw Admin URL; 4 advisory).
  Fixes applied (masking + error-hygiene test, exact-path gate scoping, evidence routing by
  diagnostic/pass, receiptBlock serialization) plus a live transient failure diagnosed and fixed
  (TransactionDeadlinePassed from VE real-time block stamps → wall-clock deadline guard).
  Round 2 APPROVED (0 blocking, 3 advisory — all three fixed after approval; suite now 90 tests).
- [x] All acceptance criteria from the Work Order and linked requirements are satisfied
  Fail-closed Tenderly config + redaction; fork origin/bytecode/PoolKey/PoolId verified vs mainnet
  at block 25932005; dedicated test address; funding + approvals recorded separately from the swap
  (normal unsigned transactions; no storage override used); 1 USDC UR v2 swap PASS at 50 bps
  (actualOut 1000167 ≥ amountOutMinimum 995166, gas 1635722); trace shows UR → PoolManager →
  6 hook ModifyLiquidity (JIT deploy/burn) → settlement transfers; evidence JSON + pins labeled
  controlled-fork; no-send gate strengthened; CI unchanged; Phase 1 decision: PASS.
- [x] Architecture is aligned with linked blueprints, or documented drift is accepted
  Tenderly Fork Execution Plan followed: two-endpoint model, cheatcodes for funding only,
  disclosed fallback, Phase 1 decision rule (PASS requires mainnet replay validity + fork PASS —
  both recorded, mainnet replay at the fork block: vanilla L=0, PROCEED).
- [x] Exploratory pass on user-visible or external behavior — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
  Live end-to-end runs against the real Virtual Environment (verify → setup → swap at 1/5/10 USDC,
  mainnet replay, transient failure diagnosis); evidence artifacts cross-checked by review delegates.
- [x] Latest `review-log.md` verdict is `APPROVED`

- [x] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [x] All phase certifications above are complete
- [x] Checklist is fully filled out with evidence
- [x] Review log is complete (`review-log.md`)
- [x] Implementation plan was followed (`implementation-plan.md`)
- [x] All intended files are present in the working tree
  Not committed unless the user asks.
- [x] Work order status updated to `in_review`
